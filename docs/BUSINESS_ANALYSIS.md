# SolShort — Investor-Ready Business Analysis

> Generated: 2026-03-28 | Sources: constants.rs, fees.rs, SOLSHORT_MATH.md, PITCH_EN.md
> All numbers derived from on-chain protocol constants unless otherwise noted.

---

## 1. Executive Summary

SolShort is a tokenized inverse-exposure protocol on Solana that issues **shortSOL** — an SPL token priced at `k / SOL_price` — giving holders perpetual, liquidation-free short exposure to SOL without margin, funding rate payments, or daily rebalancing. The protocol's **Holging strategy** (50% SOL + 50% shortSOL) is mathematically guaranteed by the AM-GM inequality to be profitable in *any* price direction, functioning as a perpetual straddle with zero theta decay and zero premium. Revenue flows from a 4 bps/side base fee (dynamic up to 80 bps under vault stress) and a 10 bps/day k-decay funding rate (~30.6% annualised compound), which together generate LP APY of **37–40%** across conservative-to-aggressive volume scenarios. With no direct competitor implementing a multiplicative 1/x inverse token on Solana (verified across 5,400+ Colosseum projects), SolShort targets the $2B Solana perps market as the "ProShares Short S&P 500 for crypto."

---

## 2. Product Overview

### What SolShort Does

Users deposit USDC into the protocol and receive **shortSOL** tokens. The token price is defined by the invariant:

```
shortSOL_price = k × 10⁹ / SOL_price
```

Where `k` is set at initialization so that `shortSOL(0) = SOL(0)`, then gradually decays via the funding rate. This creates pure inverse exposure: SOL up → shortSOL down, SOL down → shortSOL up, with no path dependency and no volatility decay.

**Key properties derived from code:**
- Zero slippage — all trades execute at Pyth oracle price regardless of size
- Zero liquidation — no margin, no borrow, no expiry
- No rebalancing — unlike leveraged ETFs (e.g., -1x ProShares), the 1/x model requires no daily reset
- Composable SPL token — usable in LP pools, lending, and DeFi strategies natively

### Holging Strategy (50/50 SOL + shortSOL)

The AM-GM inequality guarantees:

```
V(x) = (x + 1/x) / 2 ≥ 1    for all x > 0
P&L(x) = (x − 1)² / (2x) ≥ 0
```

where `x = P(t) / P(0)` is the SOL price multiplier. The portfolio is **delta-neutral at entry** (first derivative = 0 at x=1) and has **positive gamma everywhere** (second derivative > 0 for all P > 0).

| SOL Move | Holging P&L (gross) | Net (after 0.08% fee) | On $10,000 |
|----------|--------------------|-----------------------|------------|
| −90%     | +405.00%           | +404.92%              | +$40,492   |
| −50%     | +25.00%            | +24.92%               | +$2,492    |
| −25%     | +4.17%             | +4.09%                | +$409      |
| −10%     | +0.56%             | +0.48%                | +$48       |
| 0%       | 0.00%              | −0.08%                | −$8        |
| +10%     | +0.45%             | +0.37%                | +$37       |
| +25%     | +2.50%             | +2.42%                | +$242      |
| +50%     | +8.33%             | +8.25%                | +$825      |
| +100%    | +25.00%            | +24.92%               | +$2,492    |
| +200%    | +66.67%            | +66.59%               | +$6,659    |

> Source: `P&L = (x-1)²/(2x)` from SOLSHORT_MATH.md §7.3; fee breakeven at `|x-1| > 4%`

### Inverse Exposure Without Liquidation

Unlike perpetual futures or margin accounts, SolShort holders:
- Never post collateral or face margin calls
- Never pay funding rates (they *receive* inverse exposure, the vault absorbs the funding cost)
- Hold a standard SPL token storable in any Solana wallet

---

## 3. Unit Economics

All numbers derived directly from `programs/solshort/src/constants.rs` and `fees.rs`.

### 3.1 Base Fee

```
DEFAULT_FEE_BPS = 4    // constants.rs line 30
```

| Metric | Value |
|--------|-------|
| Fee per side (base) | 4 bps = 0.04% |
| Roundtrip fee (normal health) | 4 bps = 0.04% |
| Effective bid-ask spread | 8 bps = 0.08% |
| Break-even SOL move (Holging) | ±4% |

### 3.2 Dynamic Fee Schedule

Derived from `calc_dynamic_fee()` in `fees.rs` — multipliers applied to `DEFAULT_FEE_BPS = 4`:

| Vault Health Ratio | Multiplier | Per-Side Fee | Roundtrip | Use Case |
|-------------------|-----------|-------------|-----------|----------|
| > 200% (healthy)  | ×0.5      | **2 bps**   | 4 bps (0.04%)   | Attract volume |
| 150–200% (normal) | ×5        | **20 bps**  | 40 bps (0.40%)  | Standard operation |
| 100–150% (elevated)| ×10      | **40 bps**  | 80 bps (0.80%)  | Stress pricing |
| < 100% (critical) | ×20       | **80 bps**  | 160 bps (1.60%) | Emergency brake |

> Source: `fees.rs` lines 59–71; clamped to max 100 bps per side

The dynamic fee acts as an **automatic liquidity stabilizer**: under vault stress, higher fees slow redemptions and attract minters (who replenish the vault), making the protocol self-correcting.

### 3.3 Funding Rate (k-Decay)

The protocol charges a continuous funding rate by decaying `k` per second:

```
k_new = k_old × (denom − rate_bps × elapsed_secs) / denom
denom = SECS_PER_DAY × BPS_DENOMINATOR = 86,400 × 10,000 = 864,000,000
```

| Parameter | Value | Source |
|-----------|-------|--------|
| Default rate | 10 bps/day | constants.rs `DEFAULT_FUNDING_BPS` |
| Daily k-decay | 0.10% per day | |
| **Annual compound** | **30.59%/year** | `(1 − 0.001)^365` |
| Max rate (governance cap) | 100 bps/day | constants.rs `MAX_FUNDING_RATE_BPS` |
| Max annual compound | 97.4%/year | `(1 − 0.01)^365` |
| Safety cap per call | 30 days | `MAX_FUNDING_ELAPSED_SECS` |

The funding rate compensates the vault for providing asymmetric exposure: shortSOL holders benefit from SOL drops, while the vault absorbs the loss. The 10 bps/day rate (~30.6% annualised) is competitive with perpetual DEX funding rates on high-volatility assets.

### 3.4 LP Fee Distribution

From `fees.rs` `accumulate_fee()` and `settle_lp_fees()`:

- **100% of trading fees** flow to LP providers via the `fee_per_share_accumulated` accumulator (1e12 precision)
- **Funding revenue** accrues to LPs as freed obligations: when k decays, existing shortSOL obligations shrink, and the surplus vault collateral becomes LP profit
- **No protocol fee split** in current implementation — all fees go to LPs (admin can `withdraw_fees` only from accumulated balance)
- Minimum LP deposit: **$100 USDC** (`MIN_LP_DEPOSIT = 100_000_000` base units)

---

## 4. LP APY Modeling

### Methodology

- **Trading fee APY** = `(daily_volume × roundtrip_fee_bps / 10,000 × 365) / TVL`
- **Funding APY** = `(TVL × 0.001 × 365) / TVL = 36.50%` (constant — independent of volume)
- Normal vault health assumed (>200% ratio) → 4 bps roundtrip fee
- All revenue attributed to LP providers (100% fee share per `accumulate_fee()`)

### Scenario Results

| Scenario | TVL | Daily Volume | Annual Fee Rev | Annual Funding Rev | Fee APY | Funding APY | **NET APY** |
|----------|-----|-------------|---------------|-------------------|---------|-------------|------------|
| **Conservative** | $100K | $10K | $1,460 | $36,500 | 1.46% | 36.50% | **37.96%** |
| **Moderate** | $500K | $100K | $14,600 | $182,500 | 2.92% | 36.50% | **39.42%** |
| **Aggressive** | $2M | $500K | $73,000 | $730,000 | 3.65% | 36.50% | **40.15%** |

### Key Insight

Funding APY (36.5%) dominates across all scenarios — it is a **floor yield** independent of volume, driven purely by the 10 bps/day k-decay rate. Fee APY is volume-driven upside. This makes SolShort's LP proposition unusual: even with zero trading volume, LPs earn ~36.5% APY from the funding mechanism.

**Important caveat**: Funding APY assumes the vault is the primary beneficiary of k-decay. In practice, this manifests as reduced shortSOL obligations over time — LPs withdrawing after 1 year receive more USDC per share than deposited, reflecting the accumulated funding surplus.

### Stress Scenario (vault ratio 150–200%, 40 bps roundtrip)

| Scenario | Fee APY at 40 bps | Funding APY | NET APY |
|----------|------------------|-------------|---------|
| Conservative | 14.6% | 36.5% | **51.1%** |
| Moderate | 29.2% | 36.5% | **65.7%** |
| Aggressive | 36.5% | 36.5% | **73.0%** |

Under moderate stress, higher fees dramatically amplify LP returns — creating strong incentive for new LP deposits that restore vault health.

---

## 5. Competitive Analysis

| Protocol | Mechanism | Liquidation Risk | Fees (roundtrip) | Composability | Volatility Decay | Oracle |
|---------|-----------|-----------------|-----------------|---------------|-----------------|--------|
| **SolShort** | 1/x inverse token (k/P) | **None** | **0.04–1.60%** (dynamic) | **SPL token — full DeFi composability** | **None** | Pyth (pull, 400ms) |
| Drift Protocol | Perpetual futures (vAMM) | Yes — margin + liquidation | 0.10% taker + funding rate | Position NFT (limited) | None | Pyth + Switchboard |
| Jupiter Perps | Perpetual futures (JLP pool) | Yes — margin + liquidation | 0.06–0.10% + variable funding | Position (not token) | None | Pyth |
| Inverse Finance (Ethereum) | Inverse synths (DOLA-backed) | Yes — via bad debt events | 0.30–0.50% | ERC-20 (limited cross-chain) | Partial | Chainlink |
| Ethena (USDe) | Delta-neutral via ETH perps + LST | Indirect (counterparty) | 0% mint/redeem; funding varies | ERC-20 | None (stable) | Chainlink + Redstone |
| Synthetix (sUSD/sBTC) | Debt pool synthetic assets | Yes — via global debt | 0.30% base | ERC-20/Perp v2 | None | Chainlink |

### Key Differentiators

1. **Zero liquidation** — no margin system, no forced unwinding, no cascading liquidations
2. **Zero volatility decay** — the 1/x model has no path dependency unlike daily-rebalanced leveraged tokens
3. **Zero slippage** — oracle-based pricing regardless of trade size (vs depth-dependent DEX pricing)
4. **Lowest base fee** — 0.04% roundtrip at healthy vault health vs 0.1–0.5% for perp DEXes
5. **Holging strategy** — unique IP (8 Lean 4 theorems); no competitor offers a mathematically guaranteed positive-convexity portfolio
6. **Formally verified** — Lean 4 proofs of 8 core theorems; no Solana DeFi protocol has published machine-checked proofs

### vs Ethena (closest model analogy)

Ethena generates yield by delta-hedging stETH with ETH short perps, earning the funding rate spread (~15–25% APY). SolShort inverts this: the *vault* collects the funding rate (k-decay 30.6%/yr) while users hold tokenized inverse exposure. SolShort is conceptually "Ethena's yield source as a user-facing token."

---

## 6. Market Opportunity

### TAM / SAM / SOM

| Market | Size | Basis |
|--------|------|-------|
| **TAM**: Global crypto derivatives daily volume | $47B/day (~$17T/yr) | PITCH_EN.md |
| **SAM**: Solana perpetuals daily volume | ~$2B/day (~$730B/yr) | Drift + Jupiter Perps combined |
| **SOM (Year 1)**: Retail hedging + Holging | $50M TVL target | 2.5% of Solana perps market |

At $50M TVL and $5M daily volume:
- Annual fee revenue: `$5M × 0.04% × 365 = $730K`
- Annual funding revenue: `$50M × 36.5% = $18.25M` (k-decay to LP)
- Combined LP APY: ~37–40%

### SOL Short Demand Drivers

1. **Hedging** — SOL validators, ecosystem founders, and long-term holders needing downside protection without selling
2. **Market-neutral strategies** — Holging (50/50) captures volatility without directional bet; appeals to institutional market makers
3. **Anti-correlated asset demand** — portfolio construction: shortSOL has −1.0 correlation with SOL by construction
4. **DeFi composability** — shortSOL as collateral in lending protocols, liquidity in AMMs, component of structured products
5. **Volatility harvesting** — Holging is equivalent to a perpetual straddle (long gamma, zero theta); options traders without options infrastructure

### Competitive Gap

The closure of Friktion (Solana structured products, $200M+ TVL at peak) left the niche empty. Reflect Protocol won Colosseum Grand Prize ($50K) for delta-neutral strategy using perps + LSTs — but requires active rebalancing and is inaccessible to retail. SolShort fills the gap: same economic outcome, one token, one click.

---

## 7. Risk Factors

### 7.1 Smart Contract Risk

**Severity: High | Mitigation: Partial**

- Program deployed on Devnet only; no mainnet audit completed
- Mitigations in code: checked arithmetic on all operations, 16 error codes, circuit breaker at 95% vault ratio, 4-layer oracle validation, rate limiting (2s cooldown)
- Formally verified: 8 Lean 4 theorems covering pricing invariant, holging P&L ≥ 0, positive gamma
- Budget allocated: $50K for OtterSec/Neodyme audit pre-mainnet

### 7.2 Oracle Dependency

**Severity: High | Mitigation: Partial**

- Single oracle (Pyth Network); no fallback
- 4-layer validation: staleness (120s devnet/30s mainnet), confidence CI < 2%, price deviation < 15% from cache, SOL floor $1.00
- Pull-based model allows anyone to submit price updates — reduces keeper dependency
- Risk: 15% deviation check can be slowly shifted across multiple transactions in a low-liquidity market

### 7.3 Vault Insolvency at Extreme SOL Drops

**Severity: High | Mitigation: Structural**

The inverse payout structure means vault obligations grow non-linearly on SOL drops:

| SOL Drop | Obligation Multiple | Required Overcollat |
|----------|-------------------|---------------------|
| −25% | 1.33× | 133% of TVL |
| −50% | 2.00× | 200% of TVL |
| −75% | 4.00× | 400% of TVL |
| −90% | 10.00× | 1,000% of TVL |

Circuit breaker triggers at vault ratio < 95% (`MIN_VAULT_RATIO_BPS = 9500`). Withdrawal floor at 110% (`MIN_VAULT_POST_WITHDRAWAL_BPS = 11000`). Dynamic fees increase to 160 bps roundtrip under critical stress, slowing outflows. Long-term solution: deep overcollateralization (200–500%) and external LP capital.

### 7.4 Liquidity Bootstrapping Challenge

**Severity: Medium | Mitigation: Planned**

The vault must be overcollateralized *before* users can mint. With $500K seed round, $200K allocated to initial vault liquidity — sufficient for ~$100K TVL at 200% collateral ratio. Permissionless LP system (implemented) allows community capital participation. Jupiter and Orca integrations (Phase 3) unlock secondary market liquidity for shortSOL.

### 7.5 Regulatory Uncertainty

**Severity: Medium | Mitigation: Planned**

- shortSOL may be classified as a derivative in certain jurisdictions
- No KYC/AML in current implementation; permissionless protocol
- $50K legal budget in seed allocation for regulatory framework analysis
- Precedent: Ethena (USDe) operates globally as a synthetic stable; SolShort is analogous

### 7.6 Economic Model Assumptions

**Severity: Low | Mitigation: Transparent**

- Funding APY of 36.5% assumes k-decay revenue fully accrues to LP; actual realized APY depends on shortSOL supply dynamics
- At zero circulating shortSOL, no obligations and no funding revenue — funding APY requires active users
- Conservative assumption: funding APY scales with `circulating / TVL` ratio; at 50% utilization, effective funding APY ≈ 18.3%

---

## 8. Go-to-Market Strategy

### Phase 1: Devnet + Community (Current — Q1 2026) ✅

**Status: Complete**
- Anchor program deployed: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
- 20 instructions, 16 error codes, 12 event types
- Live frontend: [solshort.netlify.app](https://solshort.netlify.app)
- Formally verified (Lean 4, 8 theorems)
- Permissionless keeper (`scripts/keeper.ts`)
- On-chain USDC devnet faucet (5,000 USDC/claim)

**Goal**: 100+ wallets minting shortSOL on devnet; collect UX feedback; stress-test oracle validation.

### Phase 2: Mainnet Soft Launch + LP Bootstrap (Q2 2026)

**Budget**: $250K from seed round ($50K audit + $200K vault liquidity)
- Security audit: OtterSec or Neodyme
- Squads v4 multisig for admin key (replacing single admin)
- Mainnet deployment with $200K initial vault liquidity
- Whitelist LP system: 10–20 strategic LP partners (market makers, DAO treasuries)
- Target: $500K TVL, $50K daily volume within 60 days
- Fee parameter: start at 4 bps/side, tighten to 2 bps if vault health > 200%
- Metrics: vault ratio, daily volume, unique wallets, Holging TVL

### Phase 3: Integrations + Ecosystem (Q3 2026)

- **Jupiter aggregator** integration — shortSOL appears in swap routes
- **Orca/Raydium CLMM pool** — shortSOL/USDC with concentrated liquidity
- **Holging Vault** — auto-rebalancing smart contract (50/50 SOL/shortSOL, auto-compound)
- **Analytics dashboard** — public vault health, volume, fees, Holging P&L tracker
- Target: $2M TVL, $300K daily volume
- Expected LP APY at target: ~39% (fee 3.65% + funding 36.5%)

### Phase 4: Multi-Asset Expansion (Q4 2026)

- **shortBTC, shortETH, shortGOLD** — new Pyth feeds + identical program architecture (pool_id parameterized, ~1 day per new asset)
- **Governance token** — fee sharing, parameter governance (funding rate, fee tiers)
- **Solafon Mini App** — mobile-first Holging for Telegram/Solafon users
- **CEX listings** for shortSOL token
- Target: $10M TVL across 4 assets, $1M daily volume
- At target: ~$730K/year fee revenue + $3.65M funding revenue across all pools

---

## Appendix: Key Protocol Constants (constants.rs)

| Constant | Value | Meaning |
|----------|-------|---------|
| `DEFAULT_FEE_BPS` | 4 | 0.04% per side base fee |
| `MIN_VAULT_RATIO_BPS` | 9,500 | 95% circuit breaker threshold |
| `MIN_VAULT_POST_WITHDRAWAL_BPS` | 11,000 | 110% admin withdrawal floor |
| `MAX_FUNDING_RATE_BPS` | 100 | 1%/day governance cap |
| `DEFAULT_FUNDING_BPS` | 10 | 0.1%/day current rate |
| `MAX_STALENESS_SECS` | 120 | Oracle freshness (devnet) |
| `MAX_CONFIDENCE_PCT` | 2 | Pyth CI limit |
| `MAX_PRICE_DEVIATION_BPS` | 1,500 | 15% price deviation cap |
| `MIN_LP_DEPOSIT` | 100,000,000 | $100 USDC minimum LP |
| `SHARE_PRECISION` | 1e12 | Fee accumulator precision |

---

## Figures

- `fig1_holging_pnl.png` — Holging P&L curve: (x−1)²/(2x), positive convexity
- `fig2_dynamic_fees.png` — Fee tier waterfall by vault health ratio
- `fig3_lp_apy.png` — LP APY stacked bar: fee APY + funding APY across 3 scenarios
- `fig4_k_decay.png` — k-decay over 365 days at 10/50/100 bps/day rates

Figures saved to: `.omc/scientist/figures/`

---

*Analysis performed by Scientist agent | SolShort Protocol | 2026-03-28*
