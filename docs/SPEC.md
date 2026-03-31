# Holging — Protocol Specification

> **Source of truth.** Все документы и презентации должны ссылаться на этот файл.
> Обновляется при каждом изменении параметров протокола.
>
> Последнее обновление: 2026-03-30
> Программа: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

---

## 1. Идентификация

| Параметр | Значение |
|---|---|
| Название проекта | **Holging** |
| Полное название | Holging — Tokenized Hedge Protocol |
| Сеть | Solana Devnet (mainnet planned Q2 2026) |
| Program ID | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` |
| Frontend | https://holging.com |
| API | https://api.holging.com |
| GitHub | https://github.com/holging/holging |
| Framework | Anchor 0.32.1 (Rust) |
| Frontend stack | React 19 + Vite 7 + TypeScript |
| Oracle | Pyth Network (pull-based, ~400ms) |

---

## 2. Основная формула

```
shortSOL_price = k × 10⁹ / SOL_price
```

- **k** — нормализующая константа, устанавливается при инициализации пула: `k = P₀² / 10⁹`
- При запуске: `shortSOL_price = SOL_price` (паритет)
- k уменьшается со временем через funding rate (k-decay)

### Holging-портфель

```
V(x) = (x + 1/x) / 2 ≥ 1   (AM-GM неравенство)
P&L(x) = (x − 1)² / (2x) ≥ 0
```

Где `x = SOL_price(t) / SOL_price(0)`. Портфель 50% SOL + 50% shortSOL **никогда не теряет стоимость** (до комиссий). Доказано в Lean 4 (8 теорем).

---

## 3. Комиссии

### 3.1 Базовая комиссия

| Параметр | Значение | Источник |
|---|---|---|
| DEFAULT_FEE_BPS | **4** | `constants.rs` |
| Базовая ставка | 0.04% per side | |
| Максимальная комиссия | 100 bps (1%) per side | `update_fee.rs` |

### 3.2 Динамические комиссии

Источник: `fees.rs` → `calc_dynamic_fee()`

Множители применяются к `DEFAULT_FEE_BPS = 4`:

| Vault Health Ratio | Множитель | Per-Side | Roundtrip | Описание |
|---|---|---|---|---|
| **> 200%** | **×5** | **20 bps (0.20%)** | **40 bps (0.40%)** | Стандартная работа |
| **150–200%** | **×10** | **40 bps (0.40%)** | **80 bps (0.80%)** | Повышенная |
| **100–150%** | **×15** | **60 bps (0.60%)** | **120 bps (1.20%)** | Стресс |
| **< 100%** | **×20** | **80 bps (0.80%)** | **160 bps (1.60%)** | Критическая |

Все комиссии ограничены max 100 bps (1%) per side.

### 3.3 Формула vault health ratio

```
obligations = circulating × shortSOL_price   (в USDC)
ratio_bps = vault_balance × 10000 / obligations
```

### 3.4 Распределение комиссий

- **100%** торговых комиссий → LP провайдерам (через `fee_per_share_accumulated`)
- **0%** протокольной комиссии в текущей реализации
- Admin может вывести excess выше 110% obligations через `withdraw_fees`

---

## 4. Funding Rate (k-decay)

| Параметр | Значение | Источник |
|---|---|---|
| DEFAULT_FUNDING_BPS | **10** | Устанавливается при `initialize_funding` |
| Дневной decay | 0.10% | |
| Годовой compound | **30.59%** | `(1 − 0.001)^365` |
| MAX_FUNDING_RATE_BPS | 100 | `constants.rs` — governance cap |
| MIN_K | 1,000,000 | `constants.rs` — floor prevents zero |
| MAX_FUNDING_ELAPSED_SECS | 2,592,000 (30 дней) | `constants.rs` — cap per call |

### Формула

```
k_new = k_old × (864,000,000 − rate_bps × elapsed_secs) / 864,000,000
denom = SECS_PER_DAY × BPS_DENOMINATOR = 86,400 × 10,000 = 864,000,000
```

### Таблица ставок

| rate_bps/день | Дневной decay | Годовой compound |
|---|---|---|
| 1 | 0.01% | 3.57% |
| 5 | 0.05% | 16.62% |
| **10** | **0.10%** | **30.59%** |
| 20 | 0.20% | 52.15% |
| 50 | 0.50% | 83.86% |
| 100 | 1.00% | 97.36% |

### Распределение freed USDC

Когда k уменьшается → obligations падают → freed USDC → LP fee accumulator.

---

## 5. LP Система

| Параметр | Значение | Источник |
|---|---|---|
| MIN_LP_DEPOSIT | 100,000,000 ($100 USDC) | `constants.rs` |
| LP_TOKEN_DECIMALS | 6 | `constants.rs` |
| SHARE_PRECISION | 10¹² | `constants.rs` — fee accumulator |
| VIRTUAL_SHARES | 1,000 | `constants.rs` — dead shares |
| VIRTUAL_ASSETS | 1,000 | `constants.rs` — dead shares |

### LP Share Calculation

```
shares = usdc_amount × (lp_total_supply + 1000) / (lp_principal + 1000)
```

### Доходность LP

| Источник | Описание | Зависит от |
|---|---|---|
| Trading fees | 100% комиссий mint/redeem | Объём торгов |
| Funding rate | Freed USDC от k-decay | Circulating supply |

### LP APY модель (при vault >200%)

| Сценарий | TVL | Дневной объём | Fee APY | Funding APY | **Итого APY** |
|---|---|---|---|---|---|
| Консервативный | $500K | $100K | 29.2% | 36.5% | **65.7%** |
| Умеренный | $1M | $250K | 36.5% | 36.5% | **73.0%** |
| Агрессивный | $2M | $500K | 36.5% | 36.5% | **73.0%** |

### LP APY при стрессе (vault 150–200%, roundtrip 80 bps)

| Сценарий | TVL | Дневной объём | Fee APY | Funding APY | **Итого APY** |
|---|---|---|---|---|---|
| Консервативный | $500K | $100K | 58.4% | 36.5% | **94.9%** |
| Умеренный | $1M | $250K | 73.0% | 36.5% | **109.5%** |
| Агрессивный | $2M | $500K | 73.0% | 36.5% | **109.5%** |

### Защита LP

- Admin **не может** вывести LP principal или pending fees
- LP withdrawal заблокирован при vault ratio < 110%
- Dead shares pattern против first-depositor attack

---

## 6. Oracle (Pyth Network)

| Параметр | Значение | Источник |
|---|---|---|
| MAX_STALENESS_SECS (devnet) | 259,200 (3 дня) | `constants.rs` |
| MAX_STALENESS_SECS (mainnet) | 30 | `constants.rs` |
| MAX_CONFIDENCE_PCT | 2% | `constants.rs` |
| MAX_PRICE_DEVIATION_BPS | 1,500 (15%) | `constants.rs` |
| MAX_UPDATE_PRICE_DEVIATION_BPS | 1,500 (15%) | `constants.rs` |
| MIN_PRICE | $1.00 (10⁹) | `constants.rs` |

### 4-уровневая валидация

1. **Staleness** — цена не старше MAX_STALENESS_SECS
2. **Confidence** — CI < 2% от цены
3. **Deviation** — |Δ| ≤ 15% от cached price
4. **Floor** — цена ≥ $1.00

### Price Feeds

| Pool | Актив | Pyth Feed ID |
|---|---|---|
| sol | SOL/USD | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| tsla | TSLA/USD | `16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1` |
| spy | SPY/USD | `19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5` |
| aapl | AAPL/USD | `49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688` |

---

## 7. Безопасность

### Circuit Breaker

| Параметр | Значение | Источник |
|---|---|---|
| MIN_VAULT_RATIO_BPS | 9,500 (95%) | `constants.rs` |
| MIN_VAULT_POST_WITHDRAWAL_BPS | 11,000 (110%) | `constants.rs` |
| MIN_ACTION_INTERVAL_SECS | 2 | `constants.rs` |

- Pool автоматически на паузе при vault ratio < 95%
- Admin withdrawal заблокирован при vault < 110% obligations
- 2-секундный cooldown между mint/redeem

### Authority

- Two-step transfer: `transfer_authority` → `accept_authority`
- Admin может: pause, update_fee (max 100 bps), update_k (only if circulating=0), withdraw_fees (excess only)
- Admin **не может**: вывести LP principal, LP pending fees, изменить k при circulating > 0

---

## 8. Holging P&L (с комиссиями)

Break-even при roundtrip fee 0.40% (здоровый vault >200%):

```
(x−1)²/(2x) > 0.004  →  |x−1| > 0.089  →  SOL должен двинуться ±9%
```

| SOL движение | Gross P&L | Net P&L (−0.40% fee) | На $10,000 |
|---|---|---|---|
| −90% | +405.00% | +404.60% | +$40,460 |
| −50% | +25.00% | +24.60% | +$2,460 |
| −25% | +4.17% | +3.77% | +$377 |
| −10% | +0.56% | +0.16% | +$16 |
| 0% | 0.00% | −0.40% | −$40 |
| +10% | +0.45% | +0.05% | +$5 |
| +25% | +2.50% | +2.10% | +$210 |
| +50% | +8.33% | +7.93% | +$793 |
| +100% | +25.00% | +24.60% | +$2,460 |

---

## 9. Программа: инструкции (20)

| # | Инструкция | Кто | Описание |
|---|---|---|---|
| 1 | `initialize` | Admin | Создать пул с k, fee, Pyth feed |
| 2 | `mint` | User | USDC → shortSOL (slippage protection) |
| 3 | `redeem` | User | shortSOL → USDC (slippage + circuit breaker) |
| 4 | `initialize_lp` | Admin | Создать LP mint для пула |
| 5 | `add_liquidity` | Anyone | USDC → LP shares |
| 6 | `remove_liquidity` | LP owner | LP shares → USDC |
| 7 | `claim_lp_fees` | LP owner | Получить накопленные USDC |
| 8 | `initialize_funding` | Admin | Создать FundingConfig |
| 9 | `accrue_funding` | Permissionless | Применить k-decay + раздать LP |
| 10 | `update_funding_rate` | Admin | Изменить ставку (max 100 bps/day) |
| 11 | `update_fee` | Admin | Изменить base fee (max 100 bps) |
| 12 | `update_k` | Admin | Изменить k (только при circulating=0) |
| 13 | `set_pause` | Admin | Пауза/возобновление пула |
| 14 | `withdraw_fees` | Admin | Вывод excess выше 110% |
| 15 | `transfer_authority` | Admin | Шаг 1: предложить нового admin |
| 16 | `accept_authority` | New admin | Шаг 2: принять authority |
| 17 | `update_min_lp_deposit` | Admin | Изменить минимум LP |
| 18 | `set_feed_id` | Admin | Изменить Pyth feed ID |
| 19 | `update_price` | Permissionless | Обновить cached price |
| 20 | `create_metadata` | Admin | Metaplex metadata |

---

## 10. Accounts (state)

### PoolState
Основной account пула. Содержит: authority, k, fee_bps, vault_balance, circulating, LP данные, oracle cache, pending_authority. ~25 полей.

### FundingConfig
Конфигурация k-decay: rate_bps, last_funding_at.

### LpPosition
Позиция LP провайдера: owner, pool, lp_shares, fee_per_share_checkpoint, pending_fees.

---

## 11. Error Codes (21)

| Код | Имя | Описание |
|---|---|---|
| 6000 | Paused | Пул на паузе |
| 6001 | StaleOracle | Цена устарела |
| 6002 | OracleConfidenceTooWide | CI > 2% |
| 6003 | PriceDeviationTooHigh | >15% от cached |
| 6004 | InsufficientLiquidity | Vault не покрывает |
| 6005 | AmountTooSmall | Ноль на выходе |
| 6006 | CircuitBreaker | Vault ratio < 95% |
| 6007 | RateLimitExceeded | <2s между операциями |
| 6008 | PriceBelowMinimum | Цена < $1.00 |
| 6009 | MathOverflow | Арифметическое переполнение |
| 6010 | Unauthorized | Неверный authority |
| 6011 | InvalidFee | fee > 100 bps или rate > max |
| 6012 | CirculatingNotZero | Нельзя менять k при supply > 0 |
| 6013 | InvalidPoolId | Pool ID > 32 bytes |
| 6014 | SlippageExceeded | Output ниже минимума |
| 6015 | NoPendingAuthority | Нет pending transfer |
| 6016 | BelowMinLpDeposit | LP депозит < $100 |
| 6017 | LpNotInitialized | LP система не создана |
| 6018 | FundingConfigRequired | FundingConfig не передан |
| 6019 | NoFeesToClaim | Нет pending fees |
| 6020 | InsufficientLpShares | Недостаточно LP токенов |

---

## 12. Формальная верификация

8 теорем в **Lean 4 / Mathlib** (все компилируются без `sorry`):

1. Pricing invariant: `P₀² / P₀ = P₀`
2. PnL formula: `(x + 1/x)/2 − 1 = (x−1)²/(2x)`
3. PnL non-negativity: `(x−1)²/(2x) ≥ 0` for `x > 0`
4. AM-GM: `x + 1/x ≥ 2` for `x > 0`
5. Portfolio value ≥ 1: `(x + 1/x)/2 ≥ 1`
6. Zero PnL iff no move: `(x−1)²/(2x) = 0 ⟺ x = 1`
7. Positive gamma: `1/x³ > 0` for `x > 0`
8. Inverse relationship: `k/(2P) < k/P` for `P, k > 0`

Источник: `lean-proofs/SolshortProofs/Basic.lean`

---

## 13. CPI (Cross-Program Invocation)

Holging поддерживает CPI — любая программа может вызвать инструкции Holging от имени своего PDA.

```toml
holging = { path = "../holging", features = ["cpi"] }
```

Все 20 инструкций доступны через `holging::cpi::mint()`, `holging::cpi::redeem()`, etc.

Документация: [docs/en/CPI.md](en/CPI.md)

---

## 14. Пулы

| Pool ID | Актив | Inverse токен | Статус |
|---|---|---|---|
| sol | SOL/USD | shortSOL | ✅ Active (devnet) |
| tsla | TSLA/USD | shortTSLA | ✅ Active (devnet) |
| spy | SPY/USD | shortSPY | ✅ Active (devnet) |
| aapl | AAPL/USD | shortAAPL | ✅ Active (devnet) |

---

## 15. Документация (указатель)

| Документ | EN | RU | ZH |
|---|---|---|---|
| API Reference | [en/API.md](en/API.md) | [ru/API.md](ru/API.md) | [zh/API.md](zh/API.md) |
| Business Analysis | [en/BUSINESS.md](en/BUSINESS.md) | [ru/BUSINESS.md](ru/BUSINESS.md) | [zh/BUSINESS.md](zh/BUSINESS.md) |
| Colosseum | [en/COLOSSEUM.md](en/COLOSSEUM.md) | [ru/COLOSSEUM.md](ru/COLOSSEUM.md) | [zh/COLOSSEUM.md](zh/COLOSSEUM.md) |
| LP Guide | [en/LP.md](en/LP.md) | [ru/LP.md](ru/LP.md) | [zh/LP.md](zh/LP.md) |
| Mainnet Checklist | [en/MAINNET.md](en/MAINNET.md) | [ru/MAINNET.md](ru/MAINNET.md) | [zh/MAINNET.md](zh/MAINNET.md) |
| Math | [en/MATH.md](en/MATH.md) | [ru/MATH.md](ru/MATH.md) | [zh/MATH.md](zh/MATH.md) |
| Mint Rules | [en/MINT_RULES.md](en/MINT_RULES.md) | [ru/MINT_RULES.md](ru/MINT_RULES.md) | [zh/MINT_RULES.md](zh/MINT_RULES.md) |
| Pitch | [en/PITCH.md](en/PITCH.md) | [ru/PITCH.md](ru/PITCH.md) | [zh/PITCH.md](zh/PITCH.md) |
| Security | [en/SECURITY.md](en/SECURITY.md) | [ru/SECURITY.md](ru/SECURITY.md) | [zh/SECURITY.md](zh/SECURITY.md) |
| Strategy | [en/STRATEGY.md](en/STRATEGY.md) | [ru/STRATEGY.md](ru/STRATEGY.md) | [zh/STRATEGY.md](zh/STRATEGY.md) |
| Token | [en/TOKEN.md](en/TOKEN.md) | [ru/TOKEN.md](ru/TOKEN.md) | [zh/TOKEN.md](zh/TOKEN.md) |
| Vault | [en/VAULT.md](en/VAULT.md) | [ru/VAULT.md](ru/VAULT.md) | [zh/VAULT.md](zh/VAULT.md) |
| CPI Guide | [en/CPI.md](en/CPI.md) | — | — |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | — | — |
| Scientific Paper | [PAPER.md](PAPER.md) | — | — |
| Fee Change Guide | [FEE_CHANGE_GUIDE.md](FEE_CHANGE_GUIDE.md) | — | — |
| **This file** | **SPEC.md** | — | — |

---

## Changelog

| Дата | Изменение |
|---|---|
| 2026-03-30 | Создан SPEC.md — initial version |
| 2026-03-30 | Комиссии обновлены: ×5/×10/×15/×20 (was ×0.5/×5/×10/×20) |
| 2026-03-30 | Break-even: ±9% (was ±4%) |
| 2026-03-30 | LP APY: 65-73% (was 37-40%) |
| 2026-03-30 | ARCHITECTURE.md rewrite v1.0 |
| 2026-03-30 | Added PAPER.md (scientific paper) |
| 2026-03-30 | Added CPI guide (docs/en/CPI.md) |
