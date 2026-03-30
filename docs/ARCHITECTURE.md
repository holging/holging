# Holging — Mathematics & Architecture

## Tokenized Hedge Protocol on Solana

> Version 1.0 · March 2026 · Program `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

---

## Contents

1. Mathematical Foundations
2. shortSOL Pricing Model
3. Holging: Portfolio Convexity
4. Minting Engine Economics
5. Dynamic Fee System
6. Funding Rate (k-Decay)
7. LP System
8. Liquidity: Encapsulated Model
9. Solana Program Architecture
10. Oracle Integration (Pyth Network)
11. Security & Edge Cases
12. Protocol Constants

---

## 1. Mathematical Foundations

### 1.1 Reciprocal Function as a Financial Instrument

The core idea of Holging is using the **reciprocal (inverse) function** to create a hedge instrument.

Let P(t) be the price of the base asset (SOL) at time t. Then the shortSOL price is:

```
shortSOL(t) = k / P(t)
```

where k is a **normalizing constant** set at pool initialization.

**Choice of k:** at deployment k = P(0)², so shortSOL(0) = P(0). The shortSOL price equals SOL price at launch, making the ratio intuitive for users.

Example: if SOL = $170 at launch, then k = 170² = 28,900, and shortSOL = 28,900 / 170 = $170.

### 1.2 Properties of 1/x

The function f(x) = 1/x on (0, +∞):

```
f'(x)  = -1/x²   < 0   (decreasing — SOL up → shortSOL down)
f''(x) =  2/x³   > 0   (convex — P&L accelerates with movement)
```

**Convexity** (f'' > 0) is the fundamental property. It creates positive gamma and distinguishes Holging from linear inverse instruments.

A linear inverse token g(x) = 2P₀ - x has g''(x) = 0 — no convexity, no gamma.

### 1.3 Multiplicative vs Additive Model

**Additive model (classic inverse tokens):**

```
Return(shortSOL) = -Return(SOL)   per period
```

Problem: sequence +10%, -10% doesn't net zero — **volatility decay**:

```
(1 + 0.10)(1 - 0.10) = 0.99 → 1% loss both sides
```

**Multiplicative model (Holging):**

```
shortSOL(t) = k / P(t)
```

No "daily return". shortSOL price at any moment is exactly determined by current SOL price. No path dependency, no volatility decay, no rebalancing required.

---

## 2. shortSOL Pricing Model

### 2.1 Price Formula

```
Price_shortSOL = k × PRICE_PRECISION / Price_SOL_oracle
```

Where:
- k — constant, stored as u128 scaled by PRICE_PRECISION (1e9)
- Price_SOL_oracle — current SOL/USD from Pyth Network (scaled 1e9)

### 2.2 Pricing with Dynamic Fees

On mint (ask price):

```
fee = usdc_amount × dynamic_fee_bps / 10,000
effective_usdc = usdc_amount − fee
tokens_out = effective_usdc × PRICE_PRECISION / shortSOL_price
```

On redeem (bid price):

```
gross_usdc = shortsol_amount × shortSOL_price / PRICE_PRECISION
fee = gross_usdc × dynamic_fee_bps / 10,000
net_usdc = gross_usdc − fee
```

At healthy vault (>200% coverage): dynamic fee = 20 bps per side (0.20%).

```
Effective spread = 2 × 20 bps = 40 bps = 0.40%
```

### 2.3 k Invariance

k does not affect strategy returns — it is a scaling coefficient. Two pools with different k values produce identical percentage P&L for the same SOL movement.

Proof:

```
Return = shortSOL(t₁) / shortSOL(t₀) − 1
       = (k/P₁) / (k/P₀) − 1
       = P₀/P₁ − 1
```

k cancels. Return depends only on the price ratio P₀/P₁.

---

## 3. Holging: Portfolio Convexity

### 3.1 Holging Portfolio Definition

Holging (Hold + Hedge) — equal-weight portfolio of base asset and inverse token:

```
V_holging = 0.5 × SOL + 0.5 × shortSOL
```

Let x = P(t)/P(0) be the SOL price multiplier:

```
V_total = 0.5 × (x + 1/x)
```

### 3.2 AM-GM Inequality

By the AM-GM inequality:

```
(x + 1/x) / 2  ≥  √(x × 1/x)  =  1
```

Equality holds iff x = 1 (price unchanged).

**Corollary: V_holging ≥ 1 for all x > 0. The portfolio never loses value (pre-fees).**

### 3.3 P&L Table

```
  x (SOL mult.)  |  Holging P&L  |  HODL P&L  |  shortSOL P&L
  ─────────────────────────────────────────────────────────────
  0.10 (−90%)    |  +405.0%      |  −90.0%    |  +900.0%
  0.25 (−75%)    |  +56.3%       |  −75.0%    |  +300.0%
  0.50 (−50%)    |  +25.0%       |  −50.0%    |  +100.0%
  0.75 (−25%)    |  +4.2%        |  −25.0%    |  +33.3%
  0.90 (−10%)    |  +0.6%        |  −10.0%    |  +11.1%
  1.00 (0%)      |  0.0%         |  0.0%      |  0.0%
  1.10 (+10%)    |  +0.5%        |  +10.0%    |  −9.1%
  1.25 (+25%)    |  +2.5%        |  +25.0%    |  −20.0%
  1.50 (+50%)    |  +8.3%        |  +50.0%    |  −33.3%
  2.00 (+100%)   |  +25.0%       |  +100.0%   |  −50.0%
  3.00 (+200%)   |  +66.7%       |  +200.0%   |  −66.7%
```

### 3.4 Real P&L (with fees)

```
Real P&L = (x−1)²/(2x) − roundtrip_fee
```

With 0.40% roundtrip (healthy vault): break-even at SOL ±9%.

### 3.5 Gamma

```
d²V/dP² = P₀/P³ > 0   for all P > 0
```

Strictly positive gamma at any price — the portfolio auto-increases exposure in the profitable direction.

### 3.6 Equivalence to Perpetual Straddle

Holging ≈ perpetual straddle (long call + long put), but:
- No expiration (perpetual)
- No theta decay
- No strike selection (floating at current price)
- Cost = trading fees (analog of premium)

### 3.7 Mirror of LP Position (Uniswap V2)

```
V_holging(x) = (x + 1/x) / 2     ← convex (gamma+)
V_LP(x)      = 2√x / (1 + x)     ← concave (gamma−)
```

Holging "collects" the value that LP "loses" as impermanent loss.

---

## 4. Minting Engine Economics

### 4.1 Flow Model

```
MINT:   User → USDC → Vault   (full amount, fee stays in vault)
                    ← shortSOL ← Mint (effective amount after fee)

REDEEM: User → shortSOL → Burn
                        ← USDC ← Vault (gross − fee)
```

### 4.2 Pool Balance

At time t:
- N(t) = circulating shortSOL supply
- R(t) = USDC in vault
- P(t) = SOL price

Obligations = N(t) × k / P(t)

### 4.3 Solvency Invariant

With a single mint+redeem cycle, fees alone don't cover arbitrary price movements. Solvency is maintained by:

1. **Accumulated fee buffer** from many operations at varying prices
2. **LP principal** as collateral base
3. **Dynamic fees** that increase under vault stress
4. **Funding rate** (k-decay) that continuously reduces obligations
5. **Circuit breaker** at 95% coverage ratio

---

## 5. Dynamic Fee System

### 5.1 Fee Calculation

From `fees.rs` → `calc_dynamic_fee()`. Multipliers applied to `DEFAULT_FEE_BPS = 4`:

| Vault Health Ratio | Multiplier | Per-Side Fee | Roundtrip | Purpose |
|---|---|---|---|---|
| > 200% (healthy) | ×5 | 20 bps (0.20%) | 40 bps (0.40%) | Standard operation |
| 150–200% (normal) | ×10 | 40 bps (0.40%) | 80 bps (0.80%) | Elevated pricing |
| 100–150% (elevated) | ×15 | 60 bps (0.60%) | 120 bps (1.20%) | Stress pricing |
| < 100% (critical) | ×20 | 80 bps (0.80%) | 160 bps (1.60%) | Emergency brake |

All fees clamped to max 100 bps (1%) per side.

### 5.2 Vault Health Ratio

```
obligations = circulating × shortSOL_price   (USDC terms)
ratio_bps = vault_balance × 10,000 / obligations
```

### 5.3 Automatic Stabilizer

Dynamic fees form a self-correcting mechanism:
- Under vault stress → higher fees → slower redemptions + cheaper mints → vault recovers
- Healthy vault → lower fees → attracts volume → generates more fee revenue

### 5.4 Fee Distribution

100% of trading fees flow to LP providers via the `fee_per_share_accumulated` accumulator (precision 1e12). No protocol fee split in current implementation.

---

## 6. Funding Rate (k-Decay)

### 6.1 Mechanism

The protocol charges a continuous funding rate by decaying k over time:

```
k_new = k_old × (denom − rate_bps × elapsed_secs) / denom
denom = SECS_PER_DAY × BPS_DENOMINATOR = 86,400 × 10,000 = 864,000,000
```

Current rate: **10 bps/day** = 0.10%/day = **30.59% compound/year**.

### 6.2 Application

- **Inline** during every mint/redeem (via `apply_funding_inline`)
- **Standalone** via permissionless `accrue_funding` instruction (keeper calls hourly)
- `elapsed` capped at 30 days per call (`MAX_FUNDING_ELAPSED_SECS`)
- Floor: `k ≥ MIN_K = 1,000,000` to prevent decay to zero

### 6.3 LP Revenue from Funding

When k decays, obligations shrink. The freed USDC is distributed to LP providers:

```
freed_usdc = obligations_before − obligations_after
accumulate_fee(pool, freed_usdc)   // → LP fee accumulator
```

This creates a **floor yield** for LPs: ~30.6% APY independent of trading volume.

### 6.4 Rate Table

| rate_bps/day | Daily Decay | Annual Compound |
|---|---|---|
| 1 | 0.01% | 3.57% |
| 5 | 0.05% | 16.62% |
| **10** | **0.10%** | **30.59%** |
| 20 | 0.20% | 52.15% |
| 50 | 0.50% | 83.86% |
| 100 | 1.00% | 97.36% |

---

## 7. LP System

### 7.1 Architecture

```
LP Provider → add_liquidity(usdc_amount) → LP tokens minted
LP Provider → remove_liquidity(lp_shares) → USDC returned (principal)
LP Provider → claim_lp_fees() → USDC claimed (accumulated fees)
```

### 7.2 Share Calculation (Dead Shares Pattern)

From `fees.rs` → `calc_lp_shares()`:

```
shares = usdc_amount × (lp_total_supply + VIRTUAL_SHARES) / (lp_principal + VIRTUAL_ASSETS)
```

VIRTUAL_SHARES = VIRTUAL_ASSETS = 1,000 — ERC-4626 defense against first-depositor inflation attack.

### 7.3 Fee Accumulator

Per-share accumulator with 1e12 precision (`SHARE_PRECISION`):

```
On each fee event:
  delta = fee_amount × SHARE_PRECISION / lp_total_supply
  fee_per_share_accumulated += delta
  total_lp_fees_pending += fee_amount

On LP settle (before deposit/withdraw/claim):
  earned = (fee_per_share_accumulated − checkpoint) × lp_shares / SHARE_PRECISION
  pending_fees += earned
  checkpoint = fee_per_share_accumulated
```

### 7.4 LP Revenue Sources

1. **Trading fees** — 100% of mint/redeem fees
2. **Funding rate** — freed USDC from k-decay

### 7.5 LP APY Model

```
Fee_APY = (Daily_Volume × Roundtrip_Fee / TVL) × 365
Funding_APY = 1 − (1 − rate_bps/10,000)^365 ≈ 30.59% at 10 bps/day
Total_APY = Fee_APY + Funding_APY
```

| Scenario | TVL | Daily Volume | Fee APY | Funding APY | **Total APY** |
|---|---|---|---|---|---|
| Conservative | $500K | $100K | 29.2% | 36.5% | **65.7%** |
| Moderate | $1M | $250K | 36.5% | 36.5% | **73.0%** |
| Aggressive | $2M | $500K | 36.5% | 36.5% | **73.0%** |

### 7.6 Protections

- Admin **cannot** withdraw LP principal or pending fees (`withdraw_fees` guards `lp_principal + total_lp_fees_pending`)
- LP withdrawal blocked if vault ratio < 110% (`MIN_VAULT_POST_WITHDRAWAL_BPS = 11,000`)
- Minimum deposit: $100 USDC (`MIN_LP_DEPOSIT`)

---

## 8. Liquidity: Encapsulated Model

### 8.1 Zero Slippage

Minting Engine trades **always at oracle price ± fee**. No order book, no AMM curve:

```
Slippage = 0   for any order size, if vault_balance ≥ order_size
```

### 8.2 Secondary Market Arbitrage

After DEX listing (Jupiter/Raydium), Minting Engine anchors the price:

```
DEX price > Oracle + fee  → arbitrageur mints via ME, sells on DEX → price falls
DEX price < Oracle − fee  → arbitrageur buys on DEX, redeems via ME → price rises

Equilibrium: DEX price ∈ [Oracle − fee, Oracle + fee]
```

---

## 9. Solana Program Architecture

### 9.1 Overview

```
Program ID: CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX

┌──────────────────────────────────────────────────────────────┐
│                     Holging Program                          │
│                     (Anchor / Rust)                          │
│                                                              │
│  ┌─────────────┐  ┌───────────────────┐  ┌───────────────┐  │
│  │   State      │  │   Instructions    │  │    Events     │  │
│  │             │  │   (20 total)      │  │  (14 types)   │  │
│  │ PoolState   │  │                   │  │               │  │
│  │ FundingConf │  │ initialize        │  │ MintEvent     │  │
│  │ LpPosition  │  │ mint / redeem     │  │ RedeemEvent   │  │
│  │             │  │ add/remove_liq    │  │ LpDeposit/    │  │
│  │             │  │ claim_lp_fees     │  │  Withdraw/    │  │
│  │             │  │ accrue_funding    │  │  FeeClaimed   │  │
│  │             │  │ update_fee/k      │  │ FundingAccrued│  │
│  │             │  │ pause / unpause   │  │ FundingDistrib│  │
│  │             │  │ transfer/accept   │  │ CircuitBreaker│  │
│  │             │  │  _authority       │  │ Pause/Update* │  │
│  │             │  │ initialize_lp     │  │               │  │
│  │             │  │ initialize_funding│  │               │  │
│  │             │  │ update_price      │  │               │  │
│  │             │  │ create_metadata   │  │               │  │
│  │             │  │ set_feed_id       │  │               │  │
│  │             │  │ update_min_lp_dep │  │               │  │
│  │             │  │ update_funding_rt │  │               │  │
│  └─────────────┘  └───────────────────┘  └───────────────┘  │
│                                                              │
│  ┌─ Modules ──────────────────────────────────────────────┐  │
│  │ constants.rs  fees.rs  oracle.rs  errors.rs  events.rs │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Multi-Pool Architecture

All instructions are parameterized by `pool_id: String`:

```
pools: sol, tsla, spy, aapl   (each with own Pyth feed)
```

PDA derivation includes `pool_id`:

```rust
Pool PDA:       seeds = [b"pool",          pool_id.as_bytes()]
Vault PDA:      seeds = [b"vault",         usdc_mint.as_ref(), pool_id.as_bytes()]
shortSOL Mint:  seeds = [b"shortsol_mint", pool_id.as_bytes()]
Mint Authority: seeds = [b"mint_auth",     pool_id.as_bytes()]
LP Mint:        seeds = [b"lp_mint",       pool_pda.as_ref()]
LP Position:    seeds = [b"lp_position",   pool_pda.as_ref(), owner.as_ref()]
FundingConfig:  seeds = [b"funding",       pool_pda.as_ref()]
```

### 9.3 Account: PoolState

```rust
pub struct PoolState {
    // Core
    pub authority: Pubkey,              // Admin (transfer via two-step)
    pub k: u128,                        // Normalizing constant (×PRICE_PRECISION)
    pub fee_bps: u16,                   // Base fee (4 = 0.04%)
    pub paused: bool,                   // Emergency pause

    // Supply tracking
    pub total_minted: u64,              // Lifetime minted (1e9)
    pub total_redeemed: u64,            // Lifetime redeemed (1e9)
    pub circulating: u64,               // Current supply (1e9)

    // Vault
    pub vault_balance: u64,             // USDC in vault (1e6)
    pub total_fees_collected: u64,      // Cumulative fees (1e6)

    // Oracle
    pub pyth_feed: Pubkey,              // Pyth price feed account
    pub pyth_feed_id: [u8; 64],         // Pyth feed ID hex bytes
    pub last_oracle_price: u64,         // Cached price (1e9)
    pub last_oracle_timestamp: i64,     // Cached timestamp

    // LP system
    pub lp_mint: Pubkey,                // LP token mint PDA
    pub lp_total_supply: u64,           // Mirror of lp_mint.supply
    pub fee_per_share_accumulated: u128, // Fee accumulator (×SHARE_PRECISION)
    pub lp_principal: u64,              // Total USDC deposited by LPs
    pub min_lp_deposit: u64,            // Minimum LP deposit
    pub total_lp_fees_pending: u64,     // Sum of all LP pending fees
    pub shortsol_mint: Pubkey,          // shortSOL SPL token mint

    // Admin
    pub pending_authority: Pubkey,      // Two-step authority transfer
    pub bump: u8,                       // PDA bump
    pub mint_auth_bump: u8,             // Mint authority bump
}
```

### 9.4 Account: FundingConfig

```rust
pub struct FundingConfig {
    pub rate_bps: u16,          // Funding rate (bps/day), default 10
    pub last_funding_at: i64,   // Last accrual timestamp
    pub bump: u8,
}
```

### 9.5 Account: LpPosition

```rust
pub struct LpPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub lp_shares: u64,
    pub fee_per_share_checkpoint: u128,
    pub pending_fees: u64,
    pub bump: u8,
}
```

### 9.6 Instruction Summary (20 total)

| Category | Instruction | Who | Description |
|---|---|---|---|
| **Core** | `initialize` | Admin | Create pool with k, fee, Pyth feed |
| | `mint` | User | Deposit USDC → receive shortSOL (with slippage protection) |
| | `redeem` | User | Burn shortSOL → receive USDC (with slippage protection) |
| **LP** | `initialize_lp` | Admin | Create LP mint for pool |
| | `add_liquidity` | Anyone | Deposit USDC → receive LP shares |
| | `remove_liquidity` | LP owner | Burn LP shares → receive USDC |
| | `claim_lp_fees` | LP owner | Claim accumulated USDC fees |
| **Funding** | `initialize_funding` | Admin | Create FundingConfig with rate |
| | `accrue_funding` | Permissionless | Apply k-decay + distribute freed USDC to LPs |
| | `update_funding_rate` | Admin | Change funding rate (max 100 bps/day) |
| **Admin** | `update_fee` | Admin | Change base fee (max 100 bps) |
| | `update_k` | Admin | Change k (only when circulating == 0) |
| | `set_pause` | Admin | Pause/unpause pool |
| | `withdraw_fees` | Admin | Withdraw excess above 110% obligations + LP reserved |
| | `transfer_authority` | Admin | Propose new authority (step 1) |
| | `accept_authority` | New admin | Accept authority (step 2) |
| | `update_min_lp_deposit` | Admin | Change minimum LP deposit |
| | `set_feed_id` | Admin | Change Pyth feed ID |
| **Utility** | `update_price` | Permissionless | Refresh cached oracle price |
| | `create_metadata` | Admin | Set SPL token metadata (name, symbol, uri) |

---

## 10. Oracle Integration (Pyth Network)

### 10.1 Why Pyth

| | Pyth Network | Chainlink |
|---|---|---|
| Model | Pull-based | Push-based |
| Latency | ~400ms | ~1-12s |
| Solana native | Yes | Via bridge |
| Confidence interval | Built-in | No |
| Publishers | 90+ (Jump, Wintermute) | Variable |

### 10.2 4-Layer Validation

From `oracle.rs` → `get_validated_price()`:

1. **Staleness**: price must be ≤ MAX_STALENESS_SECS old (30s mainnet / 259,200s devnet)
2. **Confidence**: confidence_pct < 2% of price
3. **Deviation**: |new_price − cached_price| ≤ 15% (1,500 bps)
4. **Floor**: price ≥ $1.00 (MIN_PRICE)

### 10.3 Price Feeds

| Pool | Asset | Pyth Feed ID |
|---|---|---|
| sol | SOL/USD | `ef0d8b6f...b56d` |
| tsla | TSLA/USD | `16dad506...32f1` |
| spy | SPY/USD | `19e09bb8...1cd5` |
| aapl | AAPL/USD | `49f6b65c...5688` |

---

## 11. Security & Edge Cases

### 11.1 Oracle Manipulation

**Attack:** manipulate Pyth feed → mint at low price → redeem at high price.

**Defense:**
1. Confidence interval check — reject wide CI
2. Price deviation guard — reject >15% change vs cached
3. Rate limiting — 2-second cooldown between mint/redeem
4. Emergency pause — admin can freeze pool

### 11.2 Solvency Crisis

**Scenario:** vault_balance < redemption obligations.

**Defense:**
1. Circuit breaker — auto-pause at vault ratio < 95%
2. Dynamic fees — up to 80 bps per side under stress
3. Fee buffer — accumulated trading fees
4. Funding rate — k-decay continuously reduces obligations
5. LP collateral — admin cannot withdraw LP principal

```rust
// Circuit breaker (in redeem)
let ratio_bps = vault_balance × 10,000 / obligations;
if ratio_bps < MIN_VAULT_RATIO_BPS {  // 9,500 = 95%
    pool.paused = true;
    emit!(CircuitBreakerTriggered { ratio_bps, timestamp });
}
```

### 11.3 First-Depositor LP Attack

**Attack:** classic ERC-4626 share inflation — first LP deposits 1 wei, donates to vault.

**Defense:** Dead shares pattern with VIRTUAL_SHARES = VIRTUAL_ASSETS = 1,000.

### 11.4 Integer Overflow

All arithmetic uses checked_mul, checked_div, checked_add, checked_sub. Overflow → transaction reverts.

### 11.5 Reentrancy

Solana runtime prevents reentrancy natively — a program cannot invoke itself via CPI in the same execution context.

### 11.6 Two-Step Authority Transfer

Admin key change requires two transactions:
1. `transfer_authority(new_admin)` — proposes new authority
2. `accept_authority()` — new admin confirms

Prevents accidental or malicious single-step key transfer.

---

## 12. Protocol Constants

From `constants.rs`:

| Constant | Value | Meaning |
|---|---|---|
| `PRICE_PRECISION` | 1,000,000,000 (1e9) | Fixed-point price scaling |
| `USDC_DECIMALS` | 6 | USDC token decimals |
| `SHORTSOL_DECIMALS` | 9 | shortSOL token decimals |
| `DEFAULT_FEE_BPS` | 4 | Base fee 0.04% (dynamic ×5–×20) |
| `MIN_VAULT_RATIO_BPS` | 9,500 | Circuit breaker at 95% |
| `MIN_VAULT_POST_WITHDRAWAL_BPS` | 11,000 | Admin withdrawal floor 110% |
| `MAX_STALENESS_SECS` | 30 (mainnet) / 259,200 (devnet) | Oracle freshness |
| `MAX_CONFIDENCE_PCT` | 2 | Pyth CI limit (2%) |
| `MAX_PRICE_DEVIATION_BPS` | 1,500 | 15% price deviation cap |
| `MAX_UPDATE_PRICE_DEVIATION_BPS` | 1,500 | 15% for update_price |
| `MIN_PRICE` | 1,000,000,000 | $1.00 floor |
| `BPS_DENOMINATOR` | 10,000 | Basis points denominator |
| `MAX_FUNDING_RATE_BPS` | 100 | 1%/day governance cap |
| `MIN_K` | 1,000,000 | k floor (prevents decay to zero) |
| `MAX_FUNDING_ELAPSED_SECS` | 2,592,000 | 30-day funding cap per call |
| `SECS_PER_DAY` | 86,400 | Funding denominator |
| `MIN_ACTION_INTERVAL_SECS` | 2 | Rate limit (2s cooldown) |
| `MAX_POOL_ID_LEN` | 32 | Pool ID max bytes |
| `SHARE_PRECISION` | 1,000,000,000,000 (1e12) | LP fee accumulator precision |
| `VIRTUAL_SHARES` | 1,000 | Dead shares (ERC-4626 defense) |
| `VIRTUAL_ASSETS` | 1,000 | Dead assets (ERC-4626 defense) |
| `LP_TOKEN_DECIMALS` | 6 | LP token decimals |
| `MIN_LP_DEPOSIT` | 100,000,000 | $100 USDC minimum LP |

### Error Codes (21)

| Code | Name | Description |
|---|---|---|
| 6000 | `Paused` | Pool is paused |
| 6001 | `StaleOracle` | Price too old or feed_id invalid |
| 6002 | `OracleConfidenceTooWide` | CI > 2% |
| 6003 | `PriceDeviationTooHigh` | >15% change vs cached |
| 6004 | `InsufficientLiquidity` | Vault can't cover redeem |
| 6005 | `AmountTooSmall` | Zero tokens output |
| 6006 | `CircuitBreaker` | Vault ratio < 95% |
| 6007 | `RateLimitExceeded` | <2s between operations |
| 6008 | `PriceBelowMinimum` | Price < $1.00 |
| 6009 | `MathOverflow` | Arithmetic overflow |
| 6010 | `Unauthorized` | Wrong authority |
| 6011 | `InvalidFee` | fee_bps > 100 or rate > max |
| 6012 | `CirculatingNotZero` | Can't update k with supply |
| 6013 | `InvalidPoolId` | Pool ID > 32 bytes |
| 6014 | `SlippageExceeded` | Output below min_tokens_out |
| 6015 | `NoPendingAuthority` | No pending transfer |
| 6016 | `BelowMinLpDeposit` | LP deposit < $100 |
| 6017 | `LpNotInitialized` | LP system not set up |
| 6018 | `FundingConfigRequired` | FundingConfig missing |
| 6019 | `NoFeesToClaim` | No pending LP fees |
| 6020 | `InsufficientLpShares` | Not enough LP tokens |

### Events (14)

MintEvent, RedeemEvent, CircuitBreakerTriggered, AddLiquidityEvent, WithdrawFeesEvent, RemoveLiquidityEvent, ProposeAuthorityEvent, TransferAuthorityEvent, PauseEvent, UpdateFeeEvent, UpdateKEvent, FundingAccruedEvent, LpDepositEvent, LpWithdrawEvent, LpFeeClaimedEvent, UpdatePriceEvent, FundingDistributedEvent.

---

*Holging Protocol · Program CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX · Built on Solana*
