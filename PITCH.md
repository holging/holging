# Holging — Tokenized Hedge Protocol on Solana

> Промпт-описание проекта для создания презентации

---

## 1. Проблема

Сегодня чтобы зашортить SOL, пользователь должен:
- Открыть маржинальную позицию на CEX (KYC, ликвидация, funding rate)
- Купить perpetual futures (сложно, дорого, контрагентный риск)
- Использовать опционы (экспирация, theta decay, неликвидность)

**Нет простого способа получить обратную экспозицию к SOL как обычный токен**, который можно держать в кошельке, торговать на DEX, и комбинировать с другими DeFi стратегиями.

---

## 2. Решение — Holging

Holging — **протокол токенизированной обратной экспозиции** на Solana.

Пользователь вносит USDC → получает **shortSOL** — SPL-токен, цена которого **обратно пропорциональна** цене SOL:

```
shortSOL_price = k / SOL_price
```

- SOL растёт → shortSOL падает
- SOL падает → shortSOL растёт
- Нет ликвидаций, нет маржи, нет экспирации
- Токен хранится в обычном кошельке

### Ключевое отличие от конкурентов

Holging использует **мультипликативную модель** (1/x), а не аддитивную (-x). Это значит:
- **Нет volatility decay** — цена shortSOL точно определяется текущей ценой SOL в любой момент
- **Нет path dependency** — не важно как цена дошла до точки, важна только конечная цена
- **Нет ребалансировок** — протокол не требует daily rebalance как leveraged ETF

---

## 3. Как работает

### Mint (покупка shortSOL)
```
User → 170 USDC → Protocol → 0.9996 shortSOL
         ↓
    Fee: $0.068 (0.04%)
    Vault: +$170
```

### Redeem (продажа shortSOL)
```
User → 1.0 shortSOL → Protocol → $288.88 USDC (если SOL упал)
         ↓
    Fee: $0.12 (0.04%)
    Vault: -$288.88
```

### Цена shortSOL
```
shortSOL_price = k × 10⁹ / SOL_price

Где k = P₀² / 10⁹ (устанавливается при запуске, чтобы shortSOL(0) = SOL(0))
```

### Комиссия
- 0.04% на mint (ask)
- 0.04% на redeem (bid)
- Эффективный спред: 0.08% roundtrip
- **Zero slippage** — торговля всегда по оракульной цене, независимо от размера ордера

---

## 4. Holging — уникальная стратегия

**Holging = Hold + Hedge: 50% SOL + 50% shortSOL**

### Математическая гарантия

По неравенству AM-GM:
```
V(x) = (x + 1/x) / 2 ≥ 1    для любого x > 0
```

**Портфель НИКОГДА не уходит в минус** (до учёта комиссий). Любое движение SOL в любую сторону = прибыль.

### P&L = (x-1)² / (2x)

| SOL движение | Holging P&L | На $10,000 |
|-------------|-------------|------------|
| −50%        | **+25.0%**  | +$2,500    |
| −25%        | **+4.2%**   | +$417      |
| 0%          | **0.0%**    | $0         |
| +25%        | **+2.5%**   | +$250      |
| +50%        | **+8.3%**   | +$833      |
| +100%       | **+25.0%**  | +$2,500    |

### Свойства
- **Дельта = 0** на старте (рыночно-нейтральный)
- **Гамма > 0** всегда (положительная выпуклость)
- Эквивалент **бессрочного straddle** без theta decay и без premium
- **Зеркало LP в Uniswap**: Holging собирает то, что LP теряет как impermanent loss

### Break-even
SOL должен сдвинуться на ±4% для прибыли после комиссий (0.08% roundtrip).

---

## 5. Что построено

### Смарт-контракт (Solana / Anchor / Rust)
- **16 инструкций**: initialize, mint, redeem, add_liquidity, remove_liquidity, withdraw_fees, update_k, update_fee, update_price, set_pause, create_metadata, transfer_authority, accept_authority, initialize_funding, accrue_funding, update_funding_rate
- **16 кодов ошибок** с полной обработкой
- **12 типов событий** для аналитики (MintEvent, RedeemEvent, CircuitBreakerTriggered, AddLiquidityEvent, WithdrawFeesEvent, RemoveLiquidityEvent, PauseEvent, UpdateFeeEvent, UpdateKEvent, ProposeAuthorityEvent, TransferAuthorityEvent, FundingAccruedEvent)
- **Динамические комиссии** (5–50 bps в зависимости от vault ratio)
- **Funding rate** — k-decay 10 bps/день (~30.6%/год); инлайн-применение при mint/redeem без зависимости от keeper
- **Two-step authority transfer** — безопасная передача прав через propose + accept
- **Порог вывода 110%** — admin не может снизить vault ниже 110% обязательств (буфер до circuit breaker)
- **Формальная верификация** — 8 теорем доказаны в Lean 4 (Mathlib)
- **Checked arithmetic** — защита от overflow во всех операциях
- **Задеплоен на Devnet**: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

### Фронтенд (React / TypeScript / Vite)
- **6 табов**: Mint, Redeem, Holging, Holders, State, Risk Dashboard
- **State** — публичный дашборд состояния vault (vault ratio, obligations, circuit breaker)
- **Holging** — интерактивный симулятор портфеля со стратегией 50/50
- **Risk Dashboard** (admin-only) — стресс-тест, liquidity calculator, vault metrics
- **Real-time** цены SOL через Pyth oracle
- **Multi-wallet** поддержка (Phantom, Solflare)
- **Работающее приложение**: holging.com

### Безопасность оракула (Pyth Network)
4 уровня валидации:
1. **Staleness**: цена не старше 120 секунд (devnet)
2. **Confidence**: доверительный интервал < 2%
3. **Deviation**: отклонение от кэша < 15%
4. **Floor**: SOL > $1.00

### Circuit Breaker
- Автоматическая пауза при vault ratio < 95%
- Защита от bank run при падении SOL
- Admin unpause для восстановления

### Тесты
- Полный тест-сьют на Mocha/Chai
- PDA деривация, math verification, fee calculation
- Проверка k-нейтральности (доказательство что k не влияет на return)

### Скрипты деплоя
- `initialize-pool.ts` — создание пула с Pyth ценой
- `add-liquidity.ts` — пополнение vault
- `create-shortsol-metadata.ts` — SPL token metadata
- `create-usdc-metadata.ts` — devnet USDC metadata

### Solafon интеграция
- Bridge interface для встраивания в Solafon Mini App
- Stub реализация, готова к подключению SDK
- Sign transaction, notify, share, getUserProfile

---

## 6. Технологический стек

```
Blockchain:    Solana (400ms finality, $0.001 per tx)
Smart Contract: Anchor 0.32.1 (Rust), 16 инструкций
Oracle:        Pyth Network (pull-based, 400ms latency)
Frontend:      React 19 + TypeScript 5.9 + Vite 7
Wallet:        Solana Wallet Adapter
Token:         SPL Token + Metaplex metadata
Верификация:   Lean 4 + Mathlib (8 теорем)
Hosting:       holging.com
Keeper:        Node.js скрипт (scripts/keeper.ts), permissionless
Mobile:        Solafon Mini App (в разработке)
```

---

## 7. Метрики кода

```
Rust (smart contract):     ~3,500 LOC
TypeScript (frontend):     ~2,500 LOC
TypeScript (tests):        ~8,000 LOC
TypeScript (scripts):      ~500 LOC
CSS:                       ~730 LOC
Documentation:             ~1,400 строк markdown

Всего:                     ~16,000+ LOC
```

---

## 8. Экономика протокола

### Доход
- 0.04% fee на каждую операцию (mint + redeem)
- При $1M дневного объёма: **$800/день = $292K/год**
- Комиссии остаются в vault как буфер безопасности

### Формула требуемой ликвидности
```
L_required = TVL / (1 − d)

Где d = максимальное падение SOL от которого защищаемся
```

| Защита | На $100K TVL нужно в vault |
|--------|---------------------------|
| −25%   | $133K (+$33K доп.)        |
| −50%   | $200K (+$100K доп.)       |
| −75%   | $400K (+$300K доп.)       |

---

## 9. Конкурентные преимущества

| | Holging | Perp DEX (Drift, Jupiter) | Leveraged tokens |
|---|---------|--------------------------|-----------------|
| Маржа/ликвидация | Нет | Да | Частично |
| Volatility decay | Нет | Нет (funding) | Да |
| Slippage | 0% | Зависит от ликвидности | Зависит |
| Комиссия roundtrip | 0.08% | 0.1-0.3% | 0.3-1% |
| Composability | SPL токен | Позиция | ERC20/SPL |
| Holging стратегия | Встроена | Нет | Нет |
| Expiration | Нет | Нет | Нет |
| Сложность для юзера | Низкая | Высокая | Средняя |

---

## 10. Roadmap

### Phase 1: Devnet MVP ✅ (текущая)
- ✅ Anchor program: 16 инструкций, 16 кодов ошибок, 12 событий
- ✅ Pyth devnet integration
- ✅ Динамические комиссии (5–50 bps)
- ✅ Funding rate (k-decay, 10 bps/день, inline при mint/redeem)
- ✅ Two-step authority transfer (propose + accept)
- ✅ Withdraw floor 110% (буфер до circuit breaker)
- ✅ Frontend: Mint, Redeem, Holging, Holders, State, Risk Dashboard
- ✅ Lean 4 формальная верификация (8 теорем)
- ✅ Деплой на holging.com

### Phase 2: Testnet + Audit
- [ ] Security audit (OtterSec / Neodyme)
- [ ] Fuzz testing (Trident framework)
- [ ] Stress testing: 10K+ concurrent mints
- [ ] Community alpha testing

### Phase 3: Mainnet Launch
- [ ] Mainnet deployment
- [ ] Jupiter aggregator integration
- [ ] Raydium CLMM pool (shortSOL/USDC)
- [ ] Holging vault (автоматическая 50/50 стратегия)
- [ ] Analytics dashboard

### Phase 4: Multi-Asset
- [ ] shortBTC, shortETH, shortGOLD
- [ ] Governance token
- [ ] Solafon Mini App
- [ ] CEX listings

---

## 11. Команда и контакты

- **Program ID**: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
- **Network**: Solana Devnet
- **Admin**: `66HBrTxNii7eFzSTgo8mUzsij3FM7xC2L9jE2H89sDYs`
- **Ecosystem**: Solafon

---

*Holging — шорт SOL одной кнопкой. Holging — прибыль в любом направлении.*
