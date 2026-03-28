# Holging — Математика и Архитектура

## Tokenized Hedge Protocol on Solana

> Версия 0.3 · Февраль 2026 · Solafon Ecosystem

---

## Содержание

1. Математические основы
2. Модель ценообразования shortSOL
3. Holging: портфельная выпуклость
4. Экономика Minting Engine
5. Ликвидность: инкапсулированная модель
6. Архитектура Solana-программы
7. Oracle-интеграция (Pyth Network)
8. Безопасность и edge cases
9. Сравнение с EVM-реализацией
10. Roadmap к production

---

## 1. Математические основы

### 1.1 Реципрокная функция как финансовый инструмент

Центральная идея Holging — использование **реципрокной (обратной) функции** для создания хедж-инструмента.

Пусть P(t) — цена базового актива (SOL) в момент t. Тогда цена shortSOL определяется как:

```
shortSOL(t) = k / P(t)
```

где k — **константа нормализации**, устанавливаемая при инициализации контракта.

**Выбор k:** при деплое программы k = P(0)², что даёт shortSOL(0) = P(0). Это означает, что в момент запуска цена shortSOL равна цене SOL. Это упрощает UX и делает соотношение интуитивным.

Пример: если SOL = $170 при запуске, то k = 170² = 28900, и shortSOL = 28900 / 170 = $170.

### 1.2 Свойства функции 1/x

Функция f(x) = 1/x на интервале (0, +∞) обладает ключевыми свойствами:

```
f'(x) = -1/x²        < 0  (убывающая — при росте SOL shortSOL падает)
f''(x) = 2/x³         > 0  (выпуклая — ускорение P&L при движении)
```

**Выпуклость** (f'' > 0) — фундаментальное свойство. Именно оно создаёт положительную гамму и отличает Holging от линейных inverse-инструментов.

Для сравнения, линейный inverse-токен: g(x) = 2P₀ - x:

```
g'(x) = -1             (линейная)
g''(x) = 0              (нет выпуклости, нет гаммы)
```

### 1.3 Мультипликативная vs аддитивная модель

**Аддитивная модель (классические inverse tokens):**

```
Return(shortSOL) = -Return(SOL)    за период
```

Проблема: при последовательности +10%, -10% доходность не нулевая, а отрицательная. Это **volatility decay**:

```
(1 + 0.10)(1 - 0.10) = 0.99 → потеря 1%
```

Для inverse: (1 - 0.10)(1 + 0.10) = 0.99 → тоже потеря 1%. Обе стороны теряют.

**Мультипликативная модель (Holging):**

```
shortSOL(t) = k / P(t)
```

Нет «дневной доходности». Цена shortSOL в любой момент точно определяется текущей ценой SOL. Нет path dependency, нет volatility decay, нет необходимости в ребалансировке.

```
Если SOL: $100 → $110 → $99 → $105

Inverse token (additive):
  Day 1: -10%, Day 2: +10%, Day 3: -5.45%
  Compound: (0.90)(1.10)(0.9455) = 0.9359 → -6.4%
  Реальное изменение SOL: +5% → inverse «должен» быть -5%, но -6.4% из-за decay

shortSOL (multiplicative):
  Начало: k/100
  Конец: k/105
  Реальная доходность: (k/105)/(k/100) - 1 = -4.76%
  Точно -1 × ln-return SOL. Без decay.
```

---

## 2. Модель ценообразования shortSOL

### 2.1 Формула цены

```
Price_shortSOL = k / Price_SOL_oracle
```

Где:
- k — константа, зафиксированная при initialize()
- Price_SOL_oracle — текущая цена SOL/USD из Pyth Network

### 2.2 Цена с учётом комиссии

При минтинге (покупке) пользователь платит ask-цену:

```
Ask = (k / P_oracle) × (1 + fee)
```

При redemption (продаже) пользователь получает bid-цену:

```
Bid = (k / P_oracle) × (1 - fee)
```

Текущий fee = 0.04% = 0.0004. Эффективный спред:

```
Spread = Ask - Bid = (k / P) × 2 × fee = 0.08% от цены shortSOL
```

### 2.3 Значение k и его влияние

k не влияет на доходность стратегии — это масштабирующий коэффициент. Два контракта с разными k дают одинаковый процентный P&L при одинаковом движении SOL.

Доказательство:

```
Return = shortSOL(t₁) / shortSOL(t₀) - 1
       = (k/P₁) / (k/P₀) - 1
       = P₀/P₁ - 1
```

k сокращается. Return зависит только от отношения цен P₀/P₁.

Выбор k = P₀² сделан для UX: shortSOL(0) = P₀ = цена SOL при запуске.

---

## 3. Holging: портфельная выпуклость

### 3.1 Определение Holging-портфеля

Holging (Hold + Hedge) — портфель из равных долей базового актива и inverse-токена:

```
V_holging = 0.5 × SOL + 0.5 × shortSOL
```

Нормируем к начальной стоимости. Пусть x = P(t)/P(0) — мультипликатор цены SOL.

```
V_SOL_part = 0.5 × x
V_shortSOL_part = 0.5 × (1/x)
V_total = 0.5 × (x + 1/x)
```

### 3.2 Неравенство AM-GM

По неравенству между средним арифметическим и средним геометрическим:

```
(x + 1/x) / 2  ≥  √(x × 1/x)  =  1
```

Равенство достигается тогда и только тогда, когда x = 1/x, то есть x = 1 (цена не изменилась).

**Следствие: V_holging ≥ 1 при любом x > 0. Портфель никогда не уходит в минус (до учёта комиссий).**

### 3.3 P&L holging-портфеля

```
P&L(x) = (x + 1/x)/2 - 1
```

Таблица значений:

```
  x (SOL mult.)  |  Holging P&L  |  HODL P&L  |  shortSOL P&L
  ─────────────────────────────────────────────────────────────
  0.10 (-90%)    |  +405.0%      |  -90.0%    |  +900.0%
  0.25 (-75%)    |  +56.3%       |  -75.0%    |  +300.0%
  0.50 (-50%)    |  +25.0%       |  -50.0%    |  +100.0%
  0.75 (-25%)    |  +4.2%        |  -25.0%    |  +33.3%
  0.90 (-10%)    |  +0.6%        |  -10.0%    |  +11.1%
  1.00 (0%)      |  0.0%         |  0.0%      |  0.0%
  1.10 (+10%)    |  +0.5%        |  +10.0%    |  -9.1%
  1.25 (+25%)    |  +2.5%        |  +25.0%    |  -20.0%
  1.50 (+50%)    |  +8.3%        |  +50.0%    |  -33.3%
  2.00 (+100%)   |  +25.0%       |  +100.0%   |  -50.0%
  3.00 (+200%)   |  +66.7%       |  +200.0%   |  -66.7%
```

### 3.4 Гамма портфеля

Гамма — вторая производная стоимости портфеля по цене:

```
V(P) = 0.5 × P/P₀ + 0.5 × P₀/P

dV/dP = 0.5/P₀ - 0.5 × P₀/P²

d²V/dP² = P₀/P³  > 0   для всех P > 0
```

**Гамма строго положительна при любой цене.** Это означает:

1. При росте SOL — дельта портфеля растёт (больше экспозиции на рост)
2. При падении SOL — дельта портфеля падает (меньше экспозиции на падение)
3. Портфель «автоматически» увеличивает экспозицию в выигрышном направлении

### 3.5 Связь с опционными стратегиями

Holging-портфель эквивалентен **бессрочному straddle**:

```
Long Straddle = Long Call + Long Put (на одном страйке)
```

Straddle тоже имеет положительную гамму и зарабатывает при движении в любом направлении. Но у straddle есть:
- Экспирация (Holging — бессрочный)
- Theta decay (Holging — без theta)
- Выбор страйка (Holging — «страйк» = текущая цена, скользящий)

Цена этого «бессрочного straddle» = комиссии Minting Engine (аналог premium).

### 3.6 Сравнение с LP-позицией (Uniswap V2)

LP в constant-product AMM (x × y = k) имеет стоимость:

```
V_LP(x) = 2√x / (1 + x)
```

Её вторая производная отрицательна — **отрицательная гамма** = impermanent loss.

Holging — **зеркальное отражение** LP:

```
V_holging(x) = (x + 1/x) / 2      ← выпуклая (гамма+)
V_LP(x) = 2√x / (1 + x)           ← вогнутая (гамма-)
```

Их сумма:

```
V_holging + V_LP ≈ 1 + small correction
```

Holging «собирает» ту самую стоимость, которую LP «теряет» как impermanent loss.

---

## 4. Экономика Minting Engine

### 4.1 Модель потоков

```
MINT:   User → USDC → LiquidityVault
                    ← shortSOL ← MintingEngine

REDEEM: User → shortSOL → Burn
                        ← USDC ← LiquidityVault
```

### 4.2 Баланс пула

Пусть в момент t:
- N(t) = количество shortSOL в обращении
- R(t) = резервы USDC в LiquidityVault
- P(t) = цена SOL

Обязательства пула = N(t) × shortSOL_price(t) = N(t) × k/P(t)

При минтинге n токенов по цене k/P с fee:

```
R += n × (k/P) × (1 + fee)     // пользователь заплатил больше
N += n
```

При redemption n токенов:

```
R -= n × (k/P) × (1 - fee)     // пользователь получил меньше
N -= n
```

### 4.3 Инвариант платёжеспособности

**Утверждение:** если все shortSOL были зачеканены через MintingEngine (нет внешней эмиссии), то R(t) ≥ N(t) × k/P(t) при любом P(t).

Доказательство (упрощённое, для одного mint + изменение цены + redeem):

```
1. Mint n токенов при цене P₀:
   R = n × k/P₀ × (1 + fee)
   N = n

2. Цена меняется P₀ → P₁:
   Обязательства = n × k/P₁
   Резервы = n × k/P₀ × (1 + fee)   (не изменились)

3. Ratio = R / обязательства = (P₁/P₀) × (1 + fee)

   Если P₁ > P₀ (SOL вырос, shortSOL подешевел):
     Ratio > 1 + fee > 1 ✓  (пул профицитен)

   Если P₁ < P₀ (SOL упал, shortSOL подорожал):
     Ratio = (P₁/P₀) × (1 + fee)
     Ratio < 1 когда P₁/P₀ < 1/(1 + fee) ≈ 0.9996

     При fee = 0.04%: пул дефицитен если SOL упал более чем на 0.04% с момента mint.
```

**Это означает:** одна комиссия НЕ покрывает произвольное движение цены. Покрытие обеспечивается **совокупностью mint/redeem операций при разных ценах** и **буфером из накопленных комиссий**.

### 4.4 Накопление буфера

Каждая операция (mint или redeem) вносит fee в буфер:

```
Buffer += amount × shortSOL_price × fee
```

При N операций за период с средним объёмом A и средней ценой shortSOL S:

```
Buffer = N × A × S × fee × 2    (mint + redeem)
```

При ежедневном объёме $1M и fee 0.04%:

```
Daily buffer = $1,000,000 × 0.0004 × 2 = $800/day = $292,000/year
```

Этот буфер — страховой фонд пула на случай экстремальных движений.

### 4.5 Критический сценарий

Худший случай: массовый mint при высоком SOL → мгновенный крах SOL → массовый redeem.

```
1. SOL = $200. Зачеканено 1000 shortSOL по $144.50 каждый.
   R = 1000 × 144.50 × 1.0004 = $144,558

2. SOL мгновенно падает до $50.
   shortSOL price = 28900/50 = $578
   Обязательства = 1000 × 578 = $578,000

3. Ratio = 144,558 / 578,000 = 0.25 → дефицит 75%
```

**Это реальный risk.** Митигация:

1. При постепенном падении — часть holders продаёт по дороге вниз (фиксирует прибыль), уменьшая N
2. Новые мintы при низком SOL вносят больше коллатерала per token
3. Буфер накопленных комиссий
4. Circuit breakers (см. раздел 8)

---

## 5. Ликвидность: инкапсулированная модель

### 5.1 Concept: Total Value Available (TVA)

В отличие от TVL (Total Value Locked), Holging оперирует понятием TVA — весь коллатерал, доступный для redemption, без lock-up периодов.

```
TVA = LiquidityVault.balance (USDC)
```

TVA растёт с каждым mint и уменьшается с каждым redeem.

### 5.2 Zero Slippage

Minting Engine торгует **всегда по цене оракула ± fee**. Нет order book, нет AMM curve. Это означает:

```
Slippage = 0   для любого размера ордера, если TVA ≥ order_size
```

Ограничение: при redeem ордер не может превышать TVA. На практике TVA ≈ market cap shortSOL.

### 5.3 Вторичный рынок

После листинга shortSOL на DEX (Raydium, Jupiter) появляется вторичный рынок. Minting Engine выступает «якорем» цены:

```
Если DEX price > Oracle price + fee:
  → арбитражёр минтит через ME, продаёт на DEX → цена падает

Если DEX price < Oracle price - fee:
  → арбитражёр покупает на DEX, редимит через ME → цена растёт

Равновесие: DEX price ∈ [Oracle - fee, Oracle + fee]
```

Эффективный спред на вторичном рынке = 2 × fee = 0.08%.

---

## 6. Архитектура Solana-программы

### 6.1 Обзор

```
┌─────────────────────────────────────────────────────┐
│                  Holging Program                    │
│                  (Anchor / Rust)                      │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   State      │  │ Instructions │  │   Events    │ │
│  │             │  │              │  │             │ │
│  │ PoolState   │  │ initialize() │  │ MintEvent   │ │
│  │ UserState   │  │ mint()       │  │ RedeemEvent │ │
│  │             │  │ redeem()     │  │ PriceUpdate │ │
│  │             │  │ update_k()   │  │             │ │
│  │             │  │ pause()      │  │             │ │
│  └─────────────┘  └──────────────┘  └─────────────┘ │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │                   Accounts                        │ │
│  │                                                    │ │
│  │  pool_state     PDA [program, "pool"]             │ │
│  │  vault_usdc     PDA [program, "vault", mint_usdc] │ │
│  │  mint_shortsol  PDA [program, "shortsol_mint"]    │ │
│  │  pyth_feed      External (SOL/USD)                │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 6.2 Account Structures

```rust
#[account]
pub struct PoolState {
    pub authority: Pubkey,          // 32 bytes — admin
    pub k: u64,                     // 8 bytes — normalizing constant (scaled 1e9)
    pub fee_bps: u16,               // 2 bytes — fee in basis points (4 = 0.04%)
    pub total_minted: u64,          // 8 bytes — total shortSOL ever minted
    pub total_redeemed: u64,        // 8 bytes — total shortSOL ever redeemed
    pub circulating: u64,           // 8 bytes — current shortSOL supply
    pub total_fees_collected: u64,  // 8 bytes — cumulative fees (USDC, scaled 1e6)
    pub vault_balance: u64,         // 8 bytes — USDC in vault (scaled 1e6)
    pub pyth_feed: Pubkey,          // 32 bytes — Pyth SOL/USD price feed
    pub shortsol_mint: Pubkey,      // 32 bytes — SPL token mint
    pub paused: bool,               // 1 byte — emergency pause
    pub last_oracle_price: u64,     // 8 bytes — cached (scaled 1e9)
    pub last_oracle_timestamp: i64, // 8 bytes
    pub bump: u8,                   // 1 byte — PDA bump
}
// Total: ~166 bytes + padding
```

### 6.3 Instruction: mint()

```rust
pub fn mint(ctx: Context<Mint>, usdc_amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool_state;
    require!(!pool.paused, ErrorCode::Paused);

    // 1. Read Pyth oracle
    let price_feed = &ctx.accounts.pyth_feed;
    let sol_price = get_pyth_price(price_feed)?;  // scaled 1e9

    // 2. Staleness check
    let clock = Clock::get()?;
    let price_age = clock.unix_timestamp - price_feed.timestamp;
    require!(price_age <= MAX_STALENESS_SEC, ErrorCode::StaleOracle);

    // 3. Confidence check
    require!(
        price_feed.confidence * 100 / sol_price < MAX_CONFIDENCE_PCT,
        ErrorCode::OracleConfidenceTooWide
    );

    // 4. Calculate shortSOL price
    //    shortsol_price = k / sol_price
    let shortsol_price = pool.k
        .checked_mul(PRICE_PRECISION)
        .unwrap()
        .checked_div(sol_price)
        .unwrap();

    // 5. Apply fee (ask price)
    let fee_amount = usdc_amount
        .checked_mul(pool.fee_bps as u64)
        .unwrap()
        .checked_div(10_000)
        .unwrap();
    let effective_usdc = usdc_amount.checked_sub(fee_amount).unwrap();

    // 6. Calculate tokens to mint
    //    tokens = effective_usdc / shortsol_price
    let tokens = effective_usdc
        .checked_mul(PRICE_PRECISION)
        .unwrap()
        .checked_div(shortsol_price)
        .unwrap();

    require!(tokens > 0, ErrorCode::AmountTooSmall);

    // 7. Transfer USDC from user to vault
    transfer_usdc(
        &ctx.accounts.user_usdc,
        &ctx.accounts.vault_usdc,
        usdc_amount,
        &ctx.accounts.user,
        &ctx.accounts.token_program,
    )?;

    // 8. Mint shortSOL to user
    mint_shortsol(
        &ctx.accounts.shortsol_mint,
        &ctx.accounts.user_shortsol,
        tokens,
        &pool.to_account_info(),
        pool.bump,
        &ctx.accounts.token_program,
    )?;

    // 9. Update state
    pool.circulating = pool.circulating.checked_add(tokens).unwrap();
    pool.total_minted = pool.total_minted.checked_add(tokens).unwrap();
    pool.vault_balance = pool.vault_balance.checked_add(usdc_amount).unwrap();
    pool.total_fees_collected = pool.total_fees_collected.checked_add(fee_amount).unwrap();
    pool.last_oracle_price = sol_price;
    pool.last_oracle_timestamp = clock.unix_timestamp;

    // 10. Emit event
    emit!(MintEvent {
        user: ctx.accounts.user.key(),
        usdc_in: usdc_amount,
        tokens_out: tokens,
        sol_price,
        shortsol_price,
        fee: fee_amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
```

### 6.4 Instruction: redeem()

```rust
pub fn redeem(ctx: Context<Redeem>, shortsol_amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool_state;
    require!(!pool.paused, ErrorCode::Paused);

    // 1-3. Oracle checks (same as mint)
    let sol_price = get_pyth_price(&ctx.accounts.pyth_feed)?;
    // ... staleness + confidence checks ...

    // 4. Calculate USDC out
    let shortsol_price = pool.k
        .checked_mul(PRICE_PRECISION)
        .unwrap()
        .checked_div(sol_price)
        .unwrap();

    let gross_usdc = shortsol_amount
        .checked_mul(shortsol_price)
        .unwrap()
        .checked_div(PRICE_PRECISION)
        .unwrap();

    // 5. Apply fee (bid price)
    let fee_amount = gross_usdc
        .checked_mul(pool.fee_bps as u64)
        .unwrap()
        .checked_div(10_000)
        .unwrap();
    let net_usdc = gross_usdc.checked_sub(fee_amount).unwrap();

    // 6. Solvency check
    require!(net_usdc <= pool.vault_balance, ErrorCode::InsufficientLiquidity);

    // 7. Burn shortSOL
    burn_shortsol(
        &ctx.accounts.shortsol_mint,
        &ctx.accounts.user_shortsol,
        shortsol_amount,
        &ctx.accounts.user,
        &ctx.accounts.token_program,
    )?;

    // 8. Transfer USDC to user
    transfer_usdc_from_vault(
        &ctx.accounts.vault_usdc,
        &ctx.accounts.user_usdc,
        net_usdc,
        &pool.to_account_info(),
        pool.bump,
        &ctx.accounts.token_program,
    )?;

    // 9. Update state
    pool.circulating = pool.circulating.checked_sub(shortsol_amount).unwrap();
    pool.total_redeemed = pool.total_redeemed.checked_add(shortsol_amount).unwrap();
    pool.vault_balance = pool.vault_balance.checked_sub(net_usdc).unwrap();
    pool.total_fees_collected = pool.total_fees_collected.checked_add(fee_amount).unwrap();

    // 10. Emit event
    emit!(RedeemEvent { /* ... */ });

    Ok(())
}
```

### 6.5 PDA Derivation

```rust
// Pool state PDA
seeds = [b"pool", pool_id.as_bytes()]
bump = pool_state.bump

// Vault USDC (token account owned by program)
seeds = [b"vault", usdc_mint.key().as_ref()]

// shortSOL mint authority
seeds = [b"mint_auth"]
```

### 6.6 Account Validation (Anchor)

```rust
#[derive(Accounts)]
pub struct Mint<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool_state.bump,
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(
        mut,
        seeds = [b"vault", usdc_mint.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool_state,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = shortsol_mint.key() == pool_state.shortsol_mint
    )]
    pub shortsol_mint: Account<'info, token::Mint>,

    #[account(
        constraint = pyth_feed.key() == pool_state.pyth_feed
    )]
    pub pyth_feed: Account<'info, PriceUpdateV2>,

    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = shortsol_mint,
        associated_token::authority = user,
    )]
    pub user_shortsol: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, token::Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
```

---

## 7. Oracle-интеграция (Pyth Network)

### 7.1 Почему Pyth, а не Chainlink

```
                    Pyth Network         Chainlink (EVM)
  ──────────────────────────────────────────────────────
  Модель           Pull-based            Push-based
  Latency          ~400ms                ~1-12s (L1 dependent)
  Cost/update      Included in tx        Separate tx ($)
  Solana native    Да                    Через Wormhole/bridge
  Confidence       Встроенный interval   Нет
  Publishers       90+ (jump, wintermute)  Variable
```

### 7.2 Price Feed Integration

```rust
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

fn get_pyth_price(price_update: &Account<PriceUpdateV2>) -> Result<u64> {
    let feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID)?;
    let price = price_update.get_price_no_older_than(
        &Clock::get()?,
        MAX_STALENESS_SEC,  // 30 seconds
        &feed_id,
    )?;

    // Pyth price has exponent (e.g. price=17250, expo=-2 → $172.50)
    // Convert to our internal representation (scaled 1e9)
    let adjusted = if price.exponent >= 0 {
        (price.price as u64) * 10u64.pow(price.exponent as u32) * PRICE_PRECISION
    } else {
        (price.price as u64) * PRICE_PRECISION / 10u64.pow((-price.exponent) as u32)
    };

    Ok(adjusted)
}
```

### 7.3 Safety Guards

```rust
const MAX_STALENESS_SEC: u64 = 30;          // Reject prices older than 30s
const MAX_CONFIDENCE_PCT: u64 = 2;           // Reject if confidence > 2% of price
const MAX_PRICE_DEVIATION_PCT: u64 = 15;     // Reject if > 15% change vs last cached
const MIN_PRICE_USD: u64 = 1_000_000_000;    // $1 minimum (prevent division by near-zero)
```

---

## 8. Безопасность и edge cases

### 8.1 Oracle Manipulation

**Атака:** злоумышленник манипулирует Pyth feed → минтит по заниженной цене → редимит по завышенной.

**Защита:**
1. Confidence interval check — Pyth публикует confidence; отклоняем если слишком широкий
2. Price deviation guard — отклоняем если цена изменилась >15% vs cached
3. Rate limiting — максимум N операций на user за block
4. Emergency pause — admin может заморозить программу

### 8.2 Flash Loan Attack

**Атака:** flash loan для моментального mint → manipulate → redeem.

**Защита:**
1. На Solana нет нативных flash loans (в отличие от EVM)
2. Pyth price обновляется вне tx пользователя — нельзя манипулировать в той же транзакции
3. Можно добавить minimum hold period (1 slot = 400ms)

### 8.3 Solvency Crisis

**Сценарий:** vault balance < redemption obligations.

**Защита:**
1. Proportional redemption — при дефиците пользователь получает пропорциональную долю vault
2. Circuit breaker — автоматическая пауза при vault ratio < threshold
3. Fee buffer — накопленные комиссии как первый буфер

```rust
// Circuit breaker
let obligations = pool.circulating * shortsol_price / PRICE_PRECISION;
let ratio = pool.vault_balance * 10_000 / obligations;

if ratio < MIN_VAULT_RATIO_BPS {  // e.g. 9500 = 95%
    pool.paused = true;
    emit!(CircuitBreakerTriggered { ratio, timestamp: clock.unix_timestamp });
    return Err(ErrorCode::CircuitBreaker.into());
}
```

### 8.4 Integer Overflow

Все арифметические операции используют checked_mul, checked_div, checked_add, checked_sub. При overflow — транзакция revert.

Максимальные значения:
```
k (u64): max 18.4 × 10¹⁸ → при precision 1e9: max price $18.4B (достаточно)
USDC amount (u64): max 18.4 × 10¹² с precision 1e6 (достаточно)
shortSOL supply (u64): с precision 1e9 → max 18.4B tokens (достаточно)
```

### 8.5 Reentrancy

Solana runtime предотвращает reentrancy нативно: программа не может вызвать саму себя через CPI (cross-program invocation) в том же контексте исполнения.

---

## 9. Сравнение с EVM-реализацией (Shordex)

```
                        Holging (Solana)         Shordex (EVM/Polygon)
  ────────────────────────────────────────────────────────────────────
  Consensus             PoH + PoS                  PoS (Polygon)
  Block time            400ms                      2s
  Tx cost               ~$0.001                    ~$0.01-0.05
  Oracle                Pyth (pull, 400ms)         Chainlink (push, ~1s)
  Token standard        SPL Token                  ERC20
  Liquidity model       PDA vault                  Encapsulated in ERC20
  Flash loan risk       Low (no native)            Higher (EVM flash loans)
  Reentrancy risk       None (runtime)             Requires checks
  Composability         Jupiter, Raydium           Uniswap, 1inch
  Mobile integration    Solafon Mini App           Generic wallet
  Formal verification   TBD                        Pruvendo (claimed)
  Audit                 TBD (OtterSec target)      Titan (claimed)
```

### 9.1 Преимущества Solana

1. **Latency:** 400ms finality → окно для oracle arbitrage в 30× меньше чем EVM L1
2. **Cost:** fee модели 0.04% рентабельна от tx $2.50 (на ETH L1 — от $25K+)
3. **No flash loans:** основной вектор атаки EVM отсутствует
4. **Pyth native:** oracle feed обновляется в каждом slot, не требует отдельных tx
5. **Mobile-first:** через Solafon = кошелёк + dApp + дистрибуция

### 9.2 Преимущества EVM

1. **TVL dominance:** больше капитала в DeFi-экосистеме
2. **Tooling:** более зрелые аудиторские и верификационные инструменты
3. **ERC20 стандарт:** более широкая совместимость с DeFi-протоколами
4. **Multi-chain:** деплой на любую EVM-сеть (Arbitrum, Base, etc.)

---

## 10. Roadmap к production

### Phase 1: Devnet MVP (текущая)

```
[ ] Anchor program: initialize, mint, redeem
[ ] Pyth devnet integration (SOL/USD)
[ ] SPL Token mint + vault PDA
[ ] Basic safety guards (staleness, confidence)
[ ] Frontend prototype (React, real prices)
[ ] Solafon Mini App shell
```

### Phase 2: Testnet + Audit

```
[ ] Deployment on Solana testnet
[ ] Security audit (target: OtterSec or Neodyme)
[ ] Fuzz testing (Trident framework)
[ ] Circuit breaker implementation
[ ] Rate limiting per user
[ ] Stress testing: 10K+ concurrent mints
[ ] Community alpha testing
```

### Phase 3: Mainnet Launch

```
[ ] Mainnet deployment (shortSOL for SOL/USD)
[ ] Jupiter aggregator integration
[ ] Raydium CLMM pool (shortSOL/USDC)
[ ] Holging vault (automated 50/50 strategy)
[ ] Analytics dashboard (TVA, volume, fees)
[ ] Bug bounty program
```

### Phase 4: Multi-Asset Expansion

```
[ ] shortBTC (BTC/USD via Pyth)
[ ] shortETH (ETH/USD via Pyth)
[ ] shortGOLD (XAU/USD via Pyth)
[ ] Governance token (SLS)
[ ] Fee sharing with SLS stakers
[ ] CEX listings for shortSOL
[ ] Institutional API (market making)
[ ] Solafon native Mini App
```

---

## Приложение A: Ключевые константы

```
PRICE_PRECISION     = 1_000_000_000   (1e9)
USDC_PRECISION      = 1_000_000       (1e6)
SHORTSOL_DECIMALS   = 9
DEFAULT_FEE_BPS     = 4               (0.04%)
MAX_STALENESS_SEC   = 30
MAX_CONFIDENCE_PCT  = 2
MIN_VAULT_RATIO_BPS = 9500            (95%)
MAX_PRICE_DEVIATION = 1500            (15%)
```

## Приложение B: Error Codes

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Program is paused")]
    Paused,
    #[msg("Oracle price is stale")]
    StaleOracle,
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,
    #[msg("Price deviation exceeds maximum")]
    PriceDeviationTooHigh,
    #[msg("Insufficient liquidity in vault")]
    InsufficientLiquidity,
    #[msg("Amount too small")]
    AmountTooSmall,
    #[msg("Circuit breaker triggered")]
    CircuitBreaker,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Price below minimum")]
    PriceBelowMinimum,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
```

## Приложение C: Events

```rust
#[event]
pub struct MintEvent {
    pub user: Pubkey,
    pub usdc_in: u64,
    pub tokens_out: u64,
    pub sol_price: u64,
    pub shortsol_price: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemEvent {
    pub user: Pubkey,
    pub tokens_in: u64,
    pub usdc_out: u64,
    pub sol_price: u64,
    pub shortsol_price: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct CircuitBreakerTriggered {
    pub vault_ratio_bps: u64,
    pub timestamp: i64,
}
```

---

*Holging — Solafon Ecosystem · Built on Solana*
