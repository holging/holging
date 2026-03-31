# Holging — Protocol Specification

> **Source of truth.** All documents and presentations should reference this file.
> Updated on every protocol parameter change.
>
> Last updated: 2026-03-31
> Program: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

---

## 1. Identification

| Parameter | Value |
|---|---|
| Project name | **Holging** |
| Full name | Holging — Tokenized Hedge Protocol |
| Network | Solana Devnet (mainnet planned Q2 2026) |
| Program ID | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` |
| Frontend | https://holging.com |
| API | https://api.holging.com |
| GitHub | https://github.com/holging/holging |
| Framework | Anchor 0.32.1 (Rust) |
| Frontend stack | React 19 + Vite 7 + TypeScript |
| Oracle | Pyth Network (pull-based, ~400ms) |

---

## 2. Core Formula

```
shortSOL_price = k × 10⁹ / SOL_price
```

- **k** — normalizing constant, set at pool initialization: `k = P₀² / 10⁹`
- At launch: `shortSOL_price = SOL_price` (parity)
- k decreases over time via funding rate (k-decay)

### Holging Portfolio

```
V(x) = (x + 1/x) / 2 ≥ 1   (AM-GM inequality)
P&L(x) = (x − 1)² / (2x) ≥ 0
```

Where `x = SOL_price(t) / SOL_price(0)`. A portfolio of 50% SOL + 50% shortSOL **never loses value** (before fees). Proven in Lean 4 (8 theorems).

---

## 3. Fees

### 3.1 Base Fee

| Parameter | Value | Source |
|---|---|---|
| DEFAULT_FEE_BPS | **4** | `constants.rs` |
| Base rate | 0.04% per side | |
| Maximum fee | 100 bps (1%) per side | `update_fee.rs` |

### 3.2 Dynamic Fees

Source: `fees.rs` → `calc_dynamic_fee()`

Multipliers applied to `DEFAULT_FEE_BPS = 4`:

| Vault Health Ratio | Multiplier | Per-Side | Roundtrip | Description |
|---|---|---|---|---|
| **> 200%** | **×5** | **20 bps (0.20%)** | **40 bps (0.40%)** | Normal operation |
| **150–200%** | **×10** | **40 bps (0.40%)** | **80 bps (0.80%)** | Elevated |
| **100–150%** | **×15** | **60 bps (0.60%)** | **120 bps (1.20%)** | Stress |
| **< 100%** | **×20** | **80 bps (0.80%)** | **160 bps (1.60%)** | Critical |

All fees capped at max 100 bps (1%) per side.

### 3.3 Vault Health Ratio Formula

```
obligations = circulating × shortSOL_price   (in USDC)
ratio_bps = vault_balance × 10000 / obligations
```

### 3.4 Fee Distribution

- **100%** of trading fees → LP providers (via `fee_per_share_accumulated`)
- **0%** protocol fee in current implementation
- Admin can withdraw excess above 110% of obligations via `withdraw_fees`

---

## 4. Funding Rate (k-decay)

### 4.1 Adaptive Rate

Source: `fees.rs` → `calc_adaptive_rate()`

The funding rate is **adaptive** — it scales with vault health using the same tier thresholds as dynamic fees. A base rate (admin-configurable, default 3 bps/day) is multiplied by a tier-dependent factor:

| Vault Health Ratio | Multiplier | Effective Rate | Daily Decay | Annual Compound |
|---|---|---|---|---|
| **> 200%** | **×0.5** | **1.5 bps** | 0.015% | ~5.3% |
| **150–200%** | **×1** | **3 bps** | 0.030% | ~10.3% |
| **100–150%** | **×2** | **6 bps** | 0.060% | ~19.7% |
| **< 100%** | **×3** | **9 bps** | 0.090% | ~28.3% |

Result clamped to MAX_FUNDING_RATE_BPS = 100.

### 4.2 Parameters

| Parameter | Value | Source |
|---|---|---|
| Base rate (devnet) | **3** bps/day | Set via `update_funding_rate` |
| MAX_FUNDING_RATE_BPS | 100 | `constants.rs` — governance cap |
| MIN_K | 1,000,000 | `constants.rs` — floor prevents zero |
| MAX_FUNDING_ELAPSED_SECS | 2,592,000 (30 days) | `constants.rs` — cap per call |

### 4.3 K-Decay Formula

```
k_new = k_old × (864,000,000 − effective_rate_bps × elapsed_secs) / 864,000,000
denom = SECS_PER_DAY × BPS_DENOMINATOR = 86,400 × 10,000 = 864,000,000
```

### 4.4 Rate Table (for reference)

| rate_bps/day | Daily Decay | Annual Compound |
|---|---|---|
| 1 | 0.01% | 3.57% |
| 3 | 0.03% | 10.34% |
| 5 | 0.05% | 16.62% |
| 6 | 0.06% | 19.72% |
| 9 | 0.09% | 28.26% |
| 10 | 0.10% | 30.59% |
| 20 | 0.20% | 52.15% |
| 50 | 0.50% | 83.86% |
| 100 | 1.00% | 97.36% |

### 4.5 Freed USDC Distribution

When k decreases → obligations decrease → freed USDC → LP fee accumulator.

---

## 5. LP System

| Parameter | Value | Source |
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

### LP Yield Sources

| Source | Description | Depends on |
|---|---|---|
| Trading fees | 100% of mint/redeem fees | Trading volume |
| Funding rate | Freed USDC from k-decay | Circulating supply |

### LP APY Model (vault >200%, adaptive rate ×0.5 = 1.5 bps/day)

| Scenario | TVL | Daily Volume | Fee APY | Funding APY | **Total APY** |
|---|---|---|---|---|---|
| Conservative | $500K | $100K | 29.2% | 5.3% | **34.5%** |
| Moderate | $1M | $250K | 36.5% | 5.3% | **41.8%** |
| Aggressive | $2M | $500K | 36.5% | 5.3% | **41.8%** |

### LP APY Under Stress (vault 100–150%, adaptive rate ×2 = 6 bps/day)

| Scenario | TVL | Daily Volume | Fee APY | Funding APY | **Total APY** |
|---|---|---|---|---|---|
| Conservative | $500K | $100K | 58.4% | 19.7% | **78.1%** |
| Moderate | $1M | $250K | 73.0% | 19.7% | **92.7%** |
| Aggressive | $2M | $500K | 73.0% | 19.7% | **92.7%** |

### LP Protections

- Admin **cannot** withdraw LP principal or pending fees
- LP withdrawal blocked when vault ratio < 110%
- Dead shares pattern against first-depositor attack

---

## 6. Oracle (Pyth Network)

| Parameter | Value | Source |
|---|---|---|
| MAX_STALENESS_SECS (devnet) | 259,200 (3 days) | `constants.rs` |
| MAX_STALENESS_SECS (mainnet) | 30 | `constants.rs` |
| MAX_CONFIDENCE_PCT | 2% | `constants.rs` |
| MAX_PRICE_DEVIATION_BPS | 1,500 (15%) | `constants.rs` |
| MAX_UPDATE_PRICE_DEVIATION_BPS | 1,500 (15%) | `constants.rs` |
| MIN_PRICE | $1.00 (10⁹) | `constants.rs` |

### 4-Layer Validation

1. **Staleness** — price no older than MAX_STALENESS_SECS
2. **Confidence** — CI < 2% of price
3. **Deviation** — |Δ| ≤ 15% from cached price
4. **Floor** — price ≥ $1.00

### Price Feeds

| Pool | Asset | Pyth Feed ID |
|---|---|---|
| sol | SOL/USD | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| tsla | TSLA/USD | `16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1` |
| spy | SPY/USD | `19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5` |
| aapl | AAPL/USD | `49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688` |

---

## 7. Security

### Circuit Breaker

| Parameter | Value | Source |
|---|---|---|
| MIN_VAULT_RATIO_BPS | 9,500 (95%) | `constants.rs` |
| MIN_VAULT_POST_WITHDRAWAL_BPS | 11,000 (110%) | `constants.rs` |
| MIN_ACTION_INTERVAL_SECS | 2 | `constants.rs` |

- Pool automatically paused when vault ratio < 95%
- Admin withdrawal blocked when vault < 110% of obligations
- 2-second cooldown between mint/redeem

### Authority

- Two-step transfer: `transfer_authority` → `accept_authority`
- Admin can: pause, update_fee (max 100 bps), update_k (only if circulating=0), withdraw_fees (excess only), update_funding_rate (max 100 bps/day)
- Admin **cannot**: withdraw LP principal, LP pending fees, change k when circulating > 0

---

## 8. Holging P&L (with fees)

Break-even at roundtrip fee 0.40% (healthy vault >200%):

```
(x−1)²/(2x) > 0.004  →  |x−1| > 0.089  →  SOL must move ±9%
```

| SOL Movement | Gross P&L | Net P&L (−0.40% fee) | On $10,000 |
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

## 9. Program Instructions (20)

| # | Instruction | Who | Description |
|---|---|---|---|
| 1 | `initialize` | Admin | Create pool with k, fee, Pyth feed |
| 2 | `mint` | User | USDC → shortSOL (slippage protection) |
| 3 | `redeem` | User | shortSOL → USDC (slippage + circuit breaker) |
| 4 | `initialize_lp` | Admin | Create LP mint for pool |
| 5 | `add_liquidity` | Anyone | USDC → LP shares |
| 6 | `remove_liquidity` | LP owner | LP shares → USDC |
| 7 | `claim_lp_fees` | LP owner | Claim accumulated USDC fees |
| 8 | `initialize_funding` | Admin | Create FundingConfig |
| 9 | `accrue_funding` | Permissionless | Apply k-decay + distribute to LPs |
| 10 | `update_funding_rate` | Admin | Change rate (max 100 bps/day) |
| 11 | `update_fee` | Admin | Change base fee (max 100 bps) |
| 12 | `update_k` | Admin | Change k (only if circulating=0) |
| 13 | `set_pause` | Admin | Pause/resume pool |
| 14 | `withdraw_fees` | Admin | Withdraw excess above 110% |
| 15 | `transfer_authority` | Admin | Step 1: propose new admin |
| 16 | `accept_authority` | New admin | Step 2: accept authority |
| 17 | `update_min_lp_deposit` | Admin | Change LP minimum |
| 18 | `set_feed_id` | Admin | Change Pyth feed ID |
| 19 | `update_price` | Permissionless | Update cached price |
| 20 | `create_metadata` | Admin | Metaplex metadata |

---

## 10. Accounts (State)

### PoolState
Main pool account. Contains: authority, k, fee_bps, vault_balance, circulating, LP data, oracle cache, pending_authority. ~25 fields.

### FundingConfig
K-decay configuration: rate_bps, last_funding_at.

### LpPosition
LP provider position: owner, pool, lp_shares, fee_per_share_checkpoint, pending_fees.

---

## 11. Error Codes (21)

| Code | Name | Description |
|---|---|---|
| 6000 | Paused | Pool is paused |
| 6001 | StaleOracle | Price is stale |
| 6002 | OracleConfidenceTooWide | CI > 2% |
| 6003 | PriceDeviationTooHigh | >15% from cached |
| 6004 | InsufficientLiquidity | Vault insufficient |
| 6005 | AmountTooSmall | Zero output |
| 6006 | CircuitBreaker | Vault ratio < 95% |
| 6007 | RateLimitExceeded | <2s between operations |
| 6008 | PriceBelowMinimum | Price < $1.00 |
| 6009 | MathOverflow | Arithmetic overflow |
| 6010 | Unauthorized | Wrong authority |
| 6011 | InvalidFee | fee > 100 bps or rate > max |
| 6012 | CirculatingNotZero | Cannot change k with supply > 0 |
| 6013 | InvalidPoolId | Pool ID > 32 bytes |
| 6014 | SlippageExceeded | Output below minimum |
| 6015 | NoPendingAuthority | No pending transfer |
| 6016 | BelowMinLpDeposit | LP deposit < $100 |
| 6017 | LpNotInitialized | LP system not created |
| 6018 | FundingConfigRequired | FundingConfig not provided |
| 6019 | NoFeesToClaim | No pending fees |
| 6020 | InsufficientLpShares | Not enough LP tokens |

---

## 12. Formal Verification

8 theorems in **Lean 4 / Mathlib** (all compile without `sorry`):

1. Pricing invariant: `P₀² / P₀ = P₀`
2. PnL formula: `(x + 1/x)/2 − 1 = (x−1)²/(2x)`
3. PnL non-negativity: `(x−1)²/(2x) ≥ 0` for `x > 0`
4. AM-GM: `x + 1/x ≥ 2` for `x > 0`
5. Portfolio value ≥ 1: `(x + 1/x)/2 ≥ 1`
6. Zero PnL iff no move: `(x−1)²/(2x) = 0 ⟺ x = 1`
7. Positive gamma: `1/x³ > 0` for `x > 0`
8. Inverse relationship: `k/(2P) < k/P` for `P, k > 0`

Source: `lean-proofs/SolshortProofs/Basic.lean`

---

## 13. CPI (Cross-Program Invocation)

Holging supports CPI — any program can call Holging instructions on behalf of its PDA.

```toml
holging = { path = "../holging", features = ["cpi"] }
```

All 20 instructions available via `holging::cpi::mint()`, `holging::cpi::redeem()`, etc.

Documentation: [docs/CPI.md](CPI.md)

---

## 14. Pools

| Pool ID | Asset | Inverse Token | Status |
|---|---|---|---|
| sol | SOL/USD | shortSOL | ✅ Active (devnet) |
| tsla | TSLA/USD | shortTSLA | ✅ Active (devnet) |
| spy | SPY/USD | shortSPY | ✅ Active (devnet) |
| aapl | AAPL/USD | shortAAPL | ✅ Active (devnet) |

---

## 15. Documentation Index

| Document | Description |
|----------|-------------|
| [API Reference](API.md) | Transaction Builder API for AI agents |
| [Architecture](ARCHITECTURE.md) | System architecture overview |
| [Business Analysis](BUSINESS.md) | Unit economics and revenue model |
| [Colosseum](COLOSSEUM.md) | Hackathon competitive analysis |
| [CPI Guide](CPI.md) | Cross-program integration guide |
| [LP Guide](LP.md) | Liquidity provider guide |
| [Mainnet Checklist](MAINNET.md) | Mainnet readiness |
| [Math](MATH.md) | Mathematical architecture |
| [Mint Rules](MINT_RULES.md) | Token minting specification |
| [Paper](PAPER.md) | Scientific whitepaper |
| [Pitch](PITCH.md) | Investor pitch |
| [Security](SECURITY.md) | Security audit report |
| [Strategy](STRATEGY.md) | Holging strategy explained |
| [Token Spec](TOKEN.md) | shortSOL token specification |
| [Vault](VAULT.md) | Vault mechanics and analytics |
| **This file** | **Protocol specification (source of truth)** |

---

## Changelog

| Date | Change |
|---|---|
| 2026-03-31 | Translated to English, updated funding rate section for adaptive rate (M001) |
| 2026-03-31 | LP APY tables updated for adaptive funding rates |
| 2026-03-30 | Created SPEC.md — initial version |
| 2026-03-30 | Fees updated: ×5/×10/×15/×20 (was ×0.5/×5/×10/×20) |
| 2026-03-30 | Break-even: ±9% (was ±4%) |
| 2026-03-30 | ARCHITECTURE.md rewrite v1.0 |
| 2026-03-30 | Added PAPER.md (scientific paper) |
| 2026-03-30 | Added CPI guide (docs/CPI.md) |
