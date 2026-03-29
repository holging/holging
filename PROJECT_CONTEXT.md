# HOLGING — Project Context Package

> Дата сборки: 2026-03-29
> Цель: полный контекст для продолжения работы в новой сессии
> Программа: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` (Solana Devnet)
> Домен: [holging.com](https://holging.com)

---

## 1. Что это

**Holging** — протокол токенизированной обратной экспозиции к SOL на Solana. Пользователь вносит USDC, получает **shortSOL** (SPL-токен, цена = `k / SOL_price`). Без ликвидаций, маржи, экспирации. Стратегия 50/50 SOL + shortSOL математически гарантирует прибыль при любом движении цены (AM-GM inequality).

---

## 2. Структура проекта

```
solshort/
├── programs/
│   ├── holging/src/           # Основная Solana-программа (Anchor 0.32.1)
│   │   ├── lib.rs             # Entry point — 19 инструкций
│   │   ├── state.rs           # PoolState, FundingConfig, LpPosition
│   │   ├── constants.rs       # Все константы (feature-flagged devnet/mainnet)
│   │   ├── oracle.rs          # Pyth 4-уровневая валидация
│   │   ├── fees.rs            # Dynamic fees, LP shares (dead shares), accumulator
│   │   ├── errors.rs          # 21 код ошибки
│   │   ├── events.rs          # 17 типов событий (вкл. UpdateMinLpDepositEvent)
│   │   └── instructions/      # 19 обработчиков (migrate_pool удалён)
│   │       ├── initialize.rs          # Pool setup + USDC mint validation
│   │       ├── mint.rs                # USDC → shortSOL (с funding_config check)
│   │       ├── redeem.rs              # shortSOL → USDC (с circuit breaker)
│   │       ├── update_price.rs        # Permissionless oracle refresh
│   │       ├── accrue_funding.rs      # k-decay + MIN_K floor + LP distribution
│   │       ├── add_liquidity.rs       # Permissionless LP deposit
│   │       ├── remove_liquidity.rs    # LP withdrawal (vault health check)
│   │       ├── claim_lp_fees.rs       # LP fee claim (checked_sub)
│   │       ├── withdraw_fees.rs       # Admin fee withdrawal (LP protected)
│   │       ├── initialize_lp.rs       # LP system setup
│   │       ├── initialize_funding.rs  # (внутри accrue_funding.rs)
│   │       ├── update_fee.rs          # Admin: change fee_bps (max 100)
│   │       ├── update_k.rs            # Admin: change k (only if circulating=0)
│   │       ├── update_min_lp_deposit.rs # Admin: change min LP deposit + event
│   │       ├── update_funding_rate.rs # (внутри accrue_funding.rs)
│   │       ├── pause.rs              # Admin: emergency pause
│   │       ├── transfer_authority.rs  # Step 1 of 2-step transfer
│   │       ├── accept_authority.rs    # Step 2 of 2-step transfer
│   │       ├── create_metadata.rs     # Metaplex metadata for shortSOL
│   │       └── mod.rs                 # Module exports (19 modules)
│   └── faucet/src/lib.rs     # Тестовый USDC faucet
│
├── app/                       # React 19 + Vite 7 + TypeScript frontend
│   └── src/
│       ├── App.tsx            # Main app + routing
│       ├── main.tsx           # Entry point
│       ├── components/        # 12 компонентов
│       │   ├── MintForm.tsx           # Mint shortSOL UI
│       │   ├── RedeemForm.tsx         # Redeem UI
│       │   ├── LpDashboard.tsx        # LP deposit/withdraw/claim
│       │   ├── StrategyTerminal.tsx   # V-curve chart + Holging calculator
│       │   ├── PortfolioView.tsx      # User positions
│       │   ├── PositionCard.tsx       # Single position card
│       │   ├── PriceDisplay.tsx       # SOL/shortSOL prices
│       │   ├── StatePage.tsx          # Pool state viewer
│       │   ├── RiskDashboard.tsx      # Admin risk metrics
│       │   ├── TokenHolders.tsx       # shortSOL holder list
│       │   ├── FaucetButton.tsx       # Test USDC faucet
│       │   └── WalletProvider.tsx     # Wallet adapter setup
│       ├── hooks/             # 4 хука
│       │   ├── usePool.ts             # Pool state subscription
│       │   ├── usePythPrice.ts        # Pyth price feed
│       │   ├── useSolshort.ts         # Mint/redeem/LP operations
│       │   └── useTokenHolders.ts     # Token holder data
│       ├── utils/             # 3 утилиты
│       │   ├── math.ts               # Holging P&L calculator
│       │   ├── program.ts            # Anchor program setup
│       │   └── pyth.ts               # Pyth helpers
│       ├── config/pools.ts    # Multi-pool config (SOL, TSLA, SPY, AAPL)
│       └── idl/               # Anchor IDL
│
├── tests/
│   ├── solshort.ts            # 28 unit + 9 integration тестов
│   └── fixtures/
│       └── mock-pyth-price-update.json  # Mock Pyth oracle ($170 SOL)
│
├── scripts/                   # Deploy & management скрипты
│   ├── initialize-pool.ts     # Pool + funding setup
│   ├── add-liquidity.ts       # LP deposit
│   ├── keeper.ts              # Funding rate keeper (hourly)
│   ├── test-mint.ts           # Manual mint test
│   ├── create-shortsol-metadata.ts  # SPL metadata
│   ├── create-usdc-metadata.ts      # USDC metadata
│   ├── initialize-faucet.ts   # Faucet setup
│   └── migrate-devnet.ts      # One-time migration (done)
│
├── docs/                      # Документация
│   ├── SECURITY_AUDIT.md      # 15 findings (8 closed, 7 acknowledged)
│   ├── BUSINESS_ANALYSIS.md   # Unit economics, LP APY, competitive analysis
│   ├── LP_GUIDE.md            # Руководство для LP (доходности, риски, FAQ)
│   ├── VAULT_ANALYTICS.md     # Стресс-тесты, стратегии, матрица рисков
│   ├── MAINNET_CHECKLIST.md   # Pre-mainnet checklist
│   └── COLOSSEUM_ANALYSIS.md  # Конкурентный анализ (Colosseum data)
│
├── lean-proofs/               # Формальные доказательства (Lean 4)
│   └── SolshortProofs.lean    # 8 теорем: AM-GM, positive gamma, etc.
│
├── mcp-server/                # MCP сервер для AI-агентов
│   └── src/
│       ├── index.ts           # MCP entry
│       ├── tools.ts           # AI tools: mint, redeem, LP, state
│       ├── solana.ts          # Solana connection
│       └── utils.ts           # Helpers
│
├── solafon/                   # Bridge модуль
│   └── src/
│       ├── index.ts           # Entry
│       └── bridge.ts          # Cross-chain bridge logic
│
├── README.md                  # Основной README
├── PITCH.md                   # Питч (RU)
├── PITCH_EN.md                # Питч (EN)
├── SOLSHORT_MATH.md           # Математическая архитектура
├── solshort_math_architecture.md  # Расширенная мат. архитектура
├── Anchor.toml                # Anchor конфиг (devnet, test validator)
├── Cargo.toml                 # Rust workspace
├── package.json               # Node dependencies
└── tsconfig.json              # TypeScript конфиг (ES2022)
```

---

## 3. Ключевые параметры протокола (из constants.rs)

| Параметр | Значение | Feature flag |
|----------|----------|-------------|
| `PRICE_PRECISION` | 1e9 | — |
| `DEFAULT_FEE_BPS` | 4 (0.04%) | — |
| `MAX_STALENESS_SECS` | 86400 (devnet) / 30 (mainnet) | `devnet` |
| `MAX_CONFIDENCE_PCT` | 2% | — |
| `MAX_PRICE_DEVIATION_BPS` | 1500 (15%) | — |
| `MAX_UPDATE_PRICE_DEVIATION_BPS` | 1500 (15%) | — |
| `MIN_VAULT_RATIO_BPS` | 9500 (95%) | — |
| `MIN_VAULT_POST_WITHDRAWAL_BPS` | 11000 (110%) | — |
| `MIN_PRICE` | 1e9 ($1.00) | — |
| `MAX_FUNDING_RATE_BPS` | 100 (1%/day) | — |
| `MIN_K` | 1,000,000 | — |
| `MAX_FUNDING_ELAPSED_SECS` | 30 days | — |
| `SHARE_PRECISION` | 1e12 | — |
| `VIRTUAL_SHARES` | 1000 | — |
| `VIRTUAL_ASSETS` | 1000 | — |
| `MIN_LP_DEPOSIT` | 100 USDC | — |
| `USDC_MINT_PUBKEY` | EPjFWdd5... | mainnet only |

---

## 4. Текущий статус Security Fixes

### Закрытые (в этой сессии)

| # | Issue | Fix | Файлы |
|---|-------|-----|-------|
| HIGH-01 | Oracle Deviation Walk 57.5% | Подтверждён на 15% (уже был fix) | constants.rs |
| HIGH-02 | LP First-Depositor Inflation | Dead shares: VIRTUAL_SHARES=1000 | constants.rs, fees.rs |
| MEDIUM-01 | migrate_pool hardcoded offsets | **Удалён полностью** | mod.rs, lib.rs, deleted migrate_pool.rs |
| MEDIUM-02 | Optional funding_config bypass | remaining_accounts PDA check | mint.rs, redeem.rs, errors.rs |
| MEDIUM-03 | k decay к нулю | MIN_K=1e6 floor + checked_sub | constants.rs, accrue_funding.rs |
| MEDIUM-04 | saturating_sub в claim_lp_fees | checked_sub с warning log | claim_lp_fees.rs |
| MEDIUM-05 | USDC mint не валидирован | USDC_MINT_PUBKEY compile-time | constants.rs, initialize.rs |
| LOW-02 | Нет event в update_min_lp_deposit | UpdateMinLpDepositEvent | update_min_lp_deposit.rs, events.rs |
| INFO-03 | Staleness 86400с на mainnet | Feature-flag devnet/mainnet | constants.rs |

### Открытые (для будущих сессий)

| # | Issue | Приоритет | Усилие |
|---|-------|-----------|--------|
| LOW-03 | update_price permissionless (MEV griefing) | Improvement | Low |
| INFO-04 | Нет timelock на admin параметры | Trust improvement | Medium |
| — | Профессиональный аудит (OtterSec/Neodyme) | Before mainnet | External |

---

## 5. Тесты

**28/28 unit тестов проходят** ✅

- PDA derivation: 4 теста
- Math verification: 8 тестов (AM-GM, P&L formula, fee calc, token scaling)
- IDL validation: 10 тестов (19 instructions, 21 errors, 17 events, slippage, authority)
- Security properties: 6 тестов (oracle bounds, circuit breaker, fee bounds, access control)

**Integration тесты:** 9 тестов (initialize → mint → redeem → LP → fees → pause → slippage). Заблокированы devnet faucet rate limit — работают при наличии SOL airdrop.

**Конфиг тестов:**
- `tsconfig.json`: module ES2022, target ES2020
- IDL загружается через `createRequire(import.meta.url)`
- Mock Pyth oracle: `tests/fixtures/mock-pyth-price-update.json` (SOL = $170, year 2100)

---

## 6. Инструкции программы (19)

| # | Инструкция | Тип | Signer |
|---|-----------|-----|--------|
| 1 | `initialize` | Admin | authority |
| 2 | `mint` | User | user |
| 3 | `redeem` | User | user |
| 4 | `update_price` | Permissionless | any payer |
| 5 | `accrue_funding` | Permissionless | — |
| 6 | `add_liquidity` | LP | lp_provider |
| 7 | `remove_liquidity` | LP | lp_provider |
| 8 | `claim_lp_fees` | LP | lp_provider |
| 9 | `initialize_lp` | Admin | authority |
| 10 | `initialize_funding` | Admin | admin |
| 11 | `update_fee` | Admin | authority |
| 12 | `update_k` | Admin | authority |
| 13 | `update_min_lp_deposit` | Admin | authority |
| 14 | `update_funding_rate` | Admin | admin |
| 15 | `set_pause` | Admin | authority |
| 16 | `transfer_authority` | Admin | authority |
| 17 | `accept_authority` | New authority | new_authority |
| 18 | `create_metadata` | Admin | authority |
| 19 | `withdraw_fees` | Admin | authority |

---

## 7. PDA Seeds

| PDA | Seeds |
|-----|-------|
| Pool State | `["pool", pool_id]` |
| shortSOL Mint | `["shortsol_mint", pool_id]` |
| Mint Authority | `["mint_auth", pool_id]` |
| USDC Vault | `["vault", usdc_mint, pool_id]` |
| LP Mint | `["lp_mint", pool_state]` |
| LP Position | `["lp_position", pool_state, lp_provider]` |
| Funding Config | `["funding", pool_state]` |

---

## 8. Cargo features

```toml
# programs/holging/Cargo.toml
[features]
default = ["devnet"]     # devnet включён по умолчанию
devnet = []              # Devnet: MAX_STALENESS=86400, skip USDC mint validation
# Mainnet: cargo build --no-default-features → MAX_STALENESS=30, USDC_MINT validated
```

---

## 9. Документы (docs/)

| Файл | Содержание | Строк |
|------|-----------|-------|
| `SECURITY_AUDIT.md` | 15 findings, OWASP, access control matrix, PDA audit | ~700 |
| `BUSINESS_ANALYSIS.md` | Unit economics, LP APY, competitive analysis, TAM/SAM | ~350 |
| `LP_GUIDE.md` | LP руководство: доходности, 6 рисков, FAQ, как стать LP | ~320 |
| `VAULT_ANALYTICS.md` | Стресс-тесты, 5 сценариев, 4 стратегии, матрица рисков | ~400 |
| `MAINNET_CHECKLIST.md` | Pre-mainnet checklist | ~100 |
| `COLOSSEUM_ANALYSIS.md` | Colosseum конкурентный анализ | ~100 |

---

## 10. Ключевые формулы

```
shortSOL_price = k × 1e9 / SOL_price
k_init = SOL_price² / 1e9
k_decay = k × (864M − rate_bps × elapsed) / 864M
obligations = circulating × k / SOL_price / 1e3
vault_ratio = vault_balance × 10000 / obligations
fee_dynamic = base × {>200%: ×0.5, 150-200%: ×5, 100-150%: ×10, <100%: ×20}
lp_shares = usdc × (supply + 1000) / (principal + 1000)
holging_pnl = (x − 1)² / (2x)    where x = SOL_new / SOL_init
funding_apy = 1 − (1 − 10/10000)^365 ≈ 30.59%
```

---

## 11. Git — незакоммиченные изменения

**51 файл изменён.** Основные:

- `programs/holging/` — все security fixes
- `tests/solshort.ts` — ESM fix + IDL обновление
- `tsconfig.json` — ES2022 module
- `docs/LP_GUIDE.md` — новый
- `docs/VAULT_ANALYTICS.md` — новый
- `app/.netlify/`, `app/.vercel/` — удалены
- `.omc/` — Netlify/Vercel упоминания исправлены

**Рекомендуемый коммит:**
```bash
git add -A
git commit -m "security: close HIGH-01,02 + MEDIUM-01-05 + remove migrate_pool + add LP/Vault docs

- HIGH-02: dead shares pattern (VIRTUAL_SHARES=1000) in calc_lp_shares
- MEDIUM-01: remove migrate_pool instruction (attack surface reduction)
- MEDIUM-02: mandatory funding_config check in mint/redeem
- MEDIUM-03: MIN_K=1e6 floor + checked_sub in accrue_funding
- MEDIUM-04: checked_sub in claim_lp_fees with warning log
- MEDIUM-05: USDC_MINT_PUBKEY validation on mainnet
- LOW-02: UpdateMinLpDepositEvent added
- INFO-03: feature-flagged MAX_STALENESS_SECS (86400 devnet, 30 mainnet)
- tests: ESM fix, IDL updated to 19 instructions/21 errors/17 events
- docs: LP_GUIDE.md, VAULT_ANALYTICS.md
- cleanup: removed Netlify/Vercel artifacts"
```

---

## 12. Следующие шаги (TODO)

### 🔴 Перед Mainnet
- [ ] Mainnet build test: `anchor build -- --no-default-features`
- [ ] Пройти `docs/MAINNET_CHECKLIST.md`
- [ ] Профессиональный аудит (OtterSec / Neodyme)
- [ ] Restrict `update_price` — authority-only или cooldown

### 🟡 Улучшения
- [ ] Timelock на admin параметры
- [ ] Integration тесты — починить devnet faucet (или localnet)
- [ ] Обновить IDL в `app/src/idl/` после билда
- [ ] Фронтенд — проверить что app работает с новым IDL

### 🟢 Продукт
- [ ] Colosseum submission — финализировать pitch + demo
- [ ] Multi-pool (TSLA, SPY, AAPL) — уже в коде, нужны Pyth feeds
- [ ] Keeper automation — cron/systemd для `scripts/keeper.ts`

---

## 13. Быстрый старт для новой сессии

```bash
# Рабочая директория
cd $HOME/Movies/Movavi\ Video\ Editor/Projects/solshort

# Прочитать контекст
cat PROJECT_CONTEXT.md

# Собрать программу
anchor build

# Запустить тесты (unit only)
anchor test --skip-deploy

# Фронтенд
cd app && npm run dev

# Ключевые файлы для чтения:
# programs/holging/src/lib.rs          — все инструкции
# programs/holging/src/constants.rs    — все параметры
# programs/holging/src/fees.rs         — LP логика
# docs/SECURITY_AUDIT.md              — security findings
# docs/VAULT_ANALYTICS.md             — vault + LP аналитика
```
