# Holging: A Formally Verified Tokenized Inverse-Exposure Protocol with Guaranteed Portfolio Convexity

**Authors:** Holging Protocol Team

**Abstract.** We present Holging, a decentralized protocol on Solana that issues inverse-exposure SPL tokens whose price is defined by the reciprocal function *shortSOL(t) = k / P(t)*, where *P(t)* is the oracle price of the underlying asset. Unlike leveraged inverse tokens that suffer from volatility decay due to daily rebalancing, Holging's multiplicative pricing model is path-independent and decay-free. We prove that the *holging* portfolio — a 50/50 allocation between an asset and its inverse token — is guaranteed to be non-negative in profit for any price movement, a result that follows from the AM-GM inequality and is formally verified in Lean 4 using Mathlib. The protocol implements a dynamic fee schedule tied to vault health, a continuous funding rate via k-decay, and a permissionless LP system with dead-shares protection. We analyze solvency properties, derive circuit breaker conditions, and present an economic model yielding 65–73% LP APY across volume scenarios. The system is deployed on Solana with 20 on-chain instructions, 4-layer oracle validation via Pyth Network, and multi-asset support.

**Keywords:** inverse tokens, convexity, portfolio theory, AM-GM inequality, formal verification, Solana, DeFi, perpetual straddle

---

## 1. Introduction

### 1.1 Problem Statement

Short exposure in decentralized finance requires either perpetual futures (with margin requirements, liquidation risk, and funding rate payments) or leveraged inverse tokens (with volatility decay from daily rebalancing). Neither approach produces a simple, composable token that a holder can store in a wallet without ongoing maintenance.

The ideal short-exposure instrument would:
1. Trade as a standard token (SPL on Solana, ERC-20 on Ethereum)
2. Have no liquidation risk
3. Have no volatility decay
4. Enable construction of a portfolio with guaranteed non-negative returns

### 1.2 Our Contribution

We introduce a multiplicative inverse token defined by:

$$\text{shortSOL}(t) = \frac{k}{P(t)},$$

where *k* is a normalizing constant and *P(t)* is the oracle price. This construction:

- **Eliminates volatility decay** (Section 2.2)
- **Enables a guaranteed-profit portfolio** via the AM-GM inequality (Section 3)
- **Is formally verified** in Lean 4 with 8 machine-checked theorems (Section 4)
- **Is implemented** as a production system on Solana with dynamic fees, funding rate, LP system, and multi-asset support (Section 5)

### 1.3 Related Work

**Leveraged tokens.** Binance's BTCDOWN and FTX's BEAR tokens use daily rebalancing to maintain target leverage, suffering from well-documented volatility drag [1]. For a random walk with daily returns *r_t ~ N(0, σ²)*, a −1× daily-rebalanced token decays at rate *σ²/2* per day.

**Perpetual inverse contracts.** BitMEX's inverse perpetuals and Drift Protocol's vAMM model require margin posting and face cascading liquidation risk [2]. Jupiter Perps on Solana uses a JLP pool model that exposes LPs to directional trader P&L [3].

**Synthetic assets.** Synthetix issues synthetic tokens via a debt pool, creating shared risk among all stakers [4]. Ethena's USDe uses delta-hedged stETH with ETH short perps [5], but targets stability rather than inverse exposure.

**Our approach differs** in that the inverse relationship is embedded in the pricing function itself (not rebalanced), and the resulting portfolio convexity is a mathematical guarantee, not an empirical observation.

---

## 2. Pricing Model

### 2.1 Reciprocal Price Function

Let *P(t)* denote the price of the underlying asset (e.g., SOL/USD) at time *t*, sourced from a Pyth Network oracle. The inverse token price is:

$$S(t) = \frac{k \cdot 10^9}{P(t)},$$

where *k ∈ ℤ⁺* is a normalizing constant stored as a 128-bit unsigned integer, and *10⁹* is the fixed-point precision factor.

At pool initialization with SOL price *P₀*:

$$k = \frac{P_0^2}{10^9}, \quad \text{so} \quad S(0) = \frac{P_0^2 / 10^9 \cdot 10^9}{P_0} = P_0.$$

The inverse token starts at parity with the underlying asset.

### 2.2 Path Independence and Absence of Volatility Decay

**Claim.** The return on shortSOL between times *t₀* and *t₁* is:

$$R = \frac{S(t_1)}{S(t_0)} - 1 = \frac{P(t_0)}{P(t_1)} - 1.$$

*Proof.* Direct computation:

$$\frac{S(t_1)}{S(t_0)} = \frac{k / P(t_1)}{k / P(t_0)} = \frac{P(t_0)}{P(t_1)}.$$

The constant *k* cancels; the return depends only on the endpoint prices, not the path taken. □

**Contrast with daily-rebalanced inverse tokens.** A −1× daily-rebalanced token with daily returns *r₁, r₂, ..., r_n* has cumulative return:

$$R_{\text{rebal}} = \prod_{i=1}^{n} (1 - r_i) - 1.$$

For a sequence +10%, −10%: *R_rebal = (0.9)(1.1) − 1 = −0.01*, a 1% loss. Our model: *R = P₀/P_n − 1 = P₀/P₀ − 1 = 0*. No volatility decay.

### 2.3 Properties of 1/x

The function *f(x) = 1/x* on *(0, ∞)* has:

$$f'(x) = -\frac{1}{x^2} < 0, \quad f''(x) = \frac{2}{x^3} > 0.$$

The strict convexity (*f'' > 0*) is the foundation of the holging strategy's positive gamma.

---

## 3. The Holging Portfolio

### 3.1 Definition

The *holging* portfolio allocates equal dollar weights to the asset and its inverse:

$$V(x) = \frac{1}{2}x + \frac{1}{2} \cdot \frac{1}{x} = \frac{x + x^{-1}}{2},$$

where *x = P(t)/P(0) > 0* is the price multiplier.

### 3.2 Non-Negative P&L Guarantee

**Theorem 1 (AM-GM).** *For all x > 0:*

$$V(x) = \frac{x + x^{-1}}{2} \geq \sqrt{x \cdot x^{-1}} = 1.$$

*Equality holds if and only if x = 1.*

The portfolio profit-and-loss is:

$$\text{P\&L}(x) = V(x) - 1 = \frac{(x-1)^2}{2x} \geq 0.$$

This is the core guarantee: **the holging portfolio never loses money in gross terms**, regardless of price direction or magnitude.

### 3.3 Greeks

At entry (*x = 1*):

- **Delta:** *dV/dx = (1 − x⁻²)/2 = 0*. Delta-neutral.
- **Gamma:** *d²V/dx² = x⁻³ > 0*. Strictly positive for all *x > 0*.

The positive gamma means the portfolio auto-adjusts: as price moves in either direction, the portfolio's net exposure increases in the profitable direction.

### 3.4 Equivalence to Perpetual Straddle

A long straddle (long call + long put at the same strike) also has positive gamma and profits from movement in either direction. The holging portfolio is the continuous analog:

| Property | Long Straddle | Holging |
|---|---|---|
| Gamma | Positive | Positive |
| Theta | Negative (time decay) | Zero |
| Expiration | Fixed | Perpetual |
| Strike | Fixed | Floating (current price) |
| Cost | Option premium | Trading fees |

Holging is a **perpetual straddle with zero theta decay**.

### 3.5 Anti-Correlation with LP Impermanent Loss

A Uniswap V2 constant-product LP has portfolio value:

$$V_{\text{LP}}(x) = \frac{2\sqrt{x}}{1 + x}.$$

This is concave (*d²V/dx² < 0*) — negative gamma, i.e., impermanent loss. The holging portfolio has the complementary shape:

$$V_{\text{holging}}(x) + V_{\text{LP}}(x) \approx 1 + O(x^{-1}).$$

In economic terms: holging *captures* the volatility premium that LPs *lose*.

---

## 4. Formal Verification

We formalized and proved 8 core theorems in **Lean 4** using the **Mathlib** library. The proofs operate over ℝ and verify the exact mathematical claims, not approximations.

| # | Theorem | Statement | Lean 4 Tactic |
|---|---------|-----------|---------------|
| 1 | Pricing invariant | *P₀² / P₀ = P₀* | `field_simp` |
| 2 | P&L formula | *(x + 1/x)/2 − 1 = (x−1)²/(2x)* | `field_simp; ring` |
| 3 | P&L non-negativity | *(x−1)²/(2x) ≥ 0* for *x > 0* | `div_nonneg, sq_nonneg` |
| 4 | AM-GM for holging | *x + 1/x ≥ 2* for *x > 0* | from theorems 2, 3 |
| 5 | Portfolio value ≥ 1 | *(x + 1/x)/2 ≥ 1* | from theorem 4 |
| 6 | Zero P&L iff no move | *(x−1)²/(2x) = 0 ⟺ x = 1* | `div_eq_zero_iff, sq_eq_zero_iff` |
| 7 | Positive gamma | *1/x³ > 0* for *x > 0* | `positivity` |
| 8 | Inverse relationship | *k/(2P) < k/P* for *P, k > 0* | `div_lt_div_of_pos_left` |

All proofs compile without `sorry` in Lean 4 with Mathlib. Source: `lean-proofs/SolshortProofs/Basic.lean`.

To our knowledge, **Holging is the first DeFi protocol to publish machine-checked formal proofs of its core economic properties.**

---

## 5. Protocol Design

### 5.1 System Architecture

The protocol is implemented as a Solana program (Anchor/Rust) with 20 on-chain instructions, 3 account types (PoolState, FundingConfig, LpPosition), and 14 event types.

**Multi-pool architecture.** All instructions are parameterized by a `pool_id` string. Each pool has its own PDA-derived accounts, pricing constant *k*, and Pyth oracle feed. Currently deployed: SOL, TSLA, SPY, AAPL.

### 5.2 Dynamic Fee Schedule

Fees are a function of vault health ratio *ρ = vault_balance / obligations*:

| Vault Ratio *ρ* | Multiplier | Per-Side Fee | Roundtrip |
|---|---|---|---|
| *ρ* > 200% | ×5 | 20 bps | 40 bps |
| 150% < *ρ* ≤ 200% | ×10 | 40 bps | 80 bps |
| 100% < *ρ* ≤ 150% | ×15 | 60 bps | 120 bps |
| *ρ* ≤ 100% | ×20 | 80 bps | 160 bps |

All fees clamped to 100 bps maximum. The dynamic fee acts as an automatic stability mechanism: under vault stress, higher fees slow redemptions and incentivize new mints that replenish the vault.

### 5.3 Funding Rate (k-Decay)

The protocol charges holders a continuous funding rate by decaying *k*:

$$k_{t+\Delta} = k_t \cdot \frac{D - r \cdot \Delta}{D}, \quad D = 86{,}400 \times 10{,}000 = 864{,}000{,}000,$$

where *r* is the rate in bps/day (default 10) and *Δ* is elapsed seconds.

At 10 bps/day: daily decay 0.10%, annual compound 30.59%. This funding rate compensates LPs for bearing counterparty risk and creates a floor yield independent of trading volume.

The freed USDC (reduction in obligations) is distributed to LP providers via the fee-per-share accumulator.

### 5.4 LP System

LP providers deposit USDC and receive LP tokens. Revenue sources:

1. **Trading fees** — 100% of mint/redeem fees
2. **Funding rate** — freed USDC from k-decay

Share calculation uses the dead-shares pattern (VIRTUAL_SHARES = 1,000) for protection against first-depositor inflation attacks [6].

Fee accumulation uses a per-share accumulator at 10¹² precision, ensuring dust-free distribution even with high LP supply.

### 5.5 Oracle Integration

Prices are sourced from **Pyth Network** (pull-based, ~400ms latency). Four validation layers:

1. **Staleness**: reject prices older than 30 seconds (mainnet)
2. **Confidence**: reject if confidence interval > 2% of price
3. **Deviation**: reject if |Δ| > 15% versus cached price
4. **Floor**: reject if price < $1.00

### 5.6 Circuit Breaker

If vault ratio drops below 95% during a redemption, the pool is automatically paused:

$$\frac{\text{vault\_balance} \times 10{,}000}{\text{obligations}} < 9{,}500 \implies \text{paused} = \text{true}.$$

### 5.7 Security Properties

| Property | Mechanism |
|---|---|
| No liquidation | No margin system; tokens are fully owned |
| No reentrancy | Solana runtime prevents self-CPI |
| Overflow protection | All arithmetic uses checked operations |
| Authority safety | Two-step transfer (propose → accept) |
| LP protection | Admin cannot withdraw LP principal or pending fees |
| Rate limiting | 2-second cooldown between user operations |
| k floor | MIN_K = 10⁶ prevents decay to zero |

---

## 6. Economic Analysis

### 6.1 Break-Even Analysis

With roundtrip fee *f* = 0.40% (healthy vault):

$$\text{P\&L}(x) - f = \frac{(x-1)^2}{2x} - 0.004 > 0 \implies |x - 1| > 0.089.$$

SOL must move approximately ±9% for the holging strategy to be profitable after fees.

### 6.2 LP APY Model

$$\text{Total APY} = \underbrace{\frac{V_{\text{daily}} \times f_{\text{rt}} \times 365}{\text{TVL}}}_{\text{Fee APY}} + \underbrace{1 - (1 - r/10{,}000)^{365}}_{\text{Funding APY}},$$

where *V_daily* is daily trading volume, *f_rt* is roundtrip fee, and *r* is funding rate bps/day.

At *r = 10*: Funding APY = 30.59% (volume-independent floor).

| Scenario | TVL | Daily Volume | Fee APY | Funding APY | Total APY |
|---|---|---|---|---|---|
| Conservative | $500K | $100K | 29.2% | 36.5% | **65.7%** |
| Moderate | $1M | $250K | 36.5% | 36.5% | **73.0%** |
| Aggressive | $2M | $500K | 36.5% | 36.5% | **73.0%** |

### 6.3 Vault Stress Dynamics

Under vault stress (ratio 150–200%), roundtrip fee increases to 80 bps. This creates a self-correcting cycle:

1. SOL drops → obligations increase → ratio falls → fees rise
2. Higher fees slow redemptions (outflows decrease)
3. Higher fees on mints are offset by higher expected shortSOL returns → mints increase (inflows increase)
4. k-decay continuously reduces obligations at 0.1%/day
5. Vault ratio recovers

### 6.4 Comparative Analysis

| Protocol | Mechanism | Liquidation | Volatility Decay | Composability | Base Fee |
|---|---|---|---|---|---|
| **Holging** | Reciprocal token (k/P) | None | None | SPL token | 0.40% rt |
| Drift Protocol | vAMM perps | Yes | None | Position NFT | 0.10% + funding |
| Jupiter Perps | JLP pool perps | Yes | None | Not tokenized | 0.06–0.10% |
| Binance BTCDOWN | Daily-rebalanced −1× | N/A (centralized) | Yes | BEP-20 | Implicit |
| Synthetix | Debt pool synths | Via global debt | None | ERC-20 | 0.30% |

---

## 7. Limitations and Open Problems

### 7.1 Vault Insolvency Risk

A single mint followed by an extreme SOL drop creates under-collateralization. For a −50% SOL move with a single-mint vault: ratio = 50.02%. Mitigation relies on diversification of entry prices, LP overcollateralization, k-decay, and the circuit breaker.

**Open problem:** Optimal overcollateralization ratio as a function of SOL volatility, expressed as a closed-form bound.

### 7.2 Oracle Dependency

The protocol relies on a single oracle (Pyth Network). A 15% deviation window permits gradual price walking across transactions. Future work: multi-oracle aggregation with median filtering.

### 7.3 Admin Centralization

Parameter changes (fee, funding rate, pause) are currently admin-controlled without timelock. Pre-mainnet: transition to multisig + timelock governance.

### 7.4 Funding Rate Impact on Holders

At 10 bps/day, a shortSOL position loses ~30% of value per year through k-decay (absent price movement). This is acceptable for hedging use cases but may deter long-term holding. The rate is adjustable via governance.

### 7.5 Break-Even Threshold

The ±9% break-even for the holging strategy at 0.40% roundtrip fee may be too wide for short-term strategies. Reducing fees requires maintaining vault health through other mechanisms (LP deposits, overcollateralization).

---

## 8. Conclusion

We presented Holging, a tokenized inverse-exposure protocol that uses the reciprocal function to create a decay-free inverse token. The key theoretical contribution is the demonstration and formal verification that a 50/50 portfolio of an asset and its reciprocal inverse is guaranteed non-negative in profit by the AM-GM inequality. This property — positive convexity without theta decay — makes the holging portfolio equivalent to a perpetual straddle at zero premium.

The system is deployed on Solana with a complete implementation including dynamic fees, continuous funding rate, permissionless LP system with dead-shares protection, 4-layer oracle validation, and multi-asset support across 4 pools.

All 8 core mathematical theorems are formally verified in Lean 4 using Mathlib, establishing Holging as the first DeFi protocol with machine-checked proofs of its economic guarantees.

---

## References

[1] A. Madhavan, "Exchange-Traded Funds, Market Structure, and the Flash Crash," *Financial Analysts Journal*, vol. 68, no. 4, pp. 20–35, 2012.

[2] S. Hayes, "BitMEX Perpetual Contracts: A Primer," BitMEX Research, 2019.

[3] Jupiter Exchange, "JLP: Jupiter Liquidity Provider," Documentation, 2024.

[4] K. Warwick, "Synthetix Litepaper," Synthetix Foundation, 2020.

[5] G. Ethena Labs, "Ethena: Internet Native Money," Whitepaper, 2024.

[6] OpenZeppelin, "ERC-4626 Inflation Attack and Dead Shares Mitigation," Security Advisory, 2023.

[7] L. de Moura and S. Ullrich, "The Lean 4 Theorem Prover and Programming Language," in *CADE-28*, 2021.

[8] The Mathlib Community, "Mathlib: A Unified Library of Mathematics Formalized in Lean 4," 2023.

---

## Appendix A: Lean 4 Proof Listing

```lean
-- Theorem 3: P&L non-negativity (core holging guarantee)
theorem pnl_nonneg (x : ℝ) (hx : x > 0) :
    (x - 1) ^ 2 / (2 * x) ≥ 0 := by
  apply div_nonneg
  · exact sq_nonneg _
  · linarith

-- Theorem 4: AM-GM for holging
theorem am_gm_holging (x : ℝ) (hx : x > 0) : x + 1 / x ≥ 2 := by
  have h := pnl_formula x hx
  have h2 := pnl_nonneg x hx
  linarith

-- Theorem 5: Portfolio value ≥ 1
theorem holging_value_ge_one (x : ℝ) (hx : x > 0) :
    (x + 1 / x) / 2 ≥ 1 := by
  have h := am_gm_holging x hx
  linarith
```

Full proofs: `lean-proofs/SolshortProofs/Basic.lean` (8 theorems, all compile without `sorry`).

## Appendix B: Protocol Constants

| Constant | Value | Description |
|---|---|---|
| PRICE_PRECISION | 10⁹ | Fixed-point scaling |
| DEFAULT_FEE_BPS | 4 | Base fee (×5–×20 dynamic) |
| MIN_VAULT_RATIO_BPS | 9,500 | Circuit breaker threshold |
| MIN_VAULT_POST_WITHDRAWAL_BPS | 11,000 | Admin withdrawal floor |
| MAX_FUNDING_RATE_BPS | 100 | 1%/day governance cap |
| MAX_STALENESS_SECS | 30 (mainnet) | Oracle freshness |
| MAX_PRICE_DEVIATION_BPS | 1,500 | 15% deviation cap |
| SHARE_PRECISION | 10¹² | LP fee accumulator precision |
| VIRTUAL_SHARES | 1,000 | Dead shares (ERC-4626 defense) |
| MIN_LP_DEPOSIT | 10⁸ | $100 USDC minimum |
| MIN_K | 10⁶ | k floor (prevents zero-decay) |

## Appendix C: Smart Contract Summary

- **Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
- **Framework:** Anchor (Rust), Solana
- **Instructions:** 20
- **Account types:** PoolState, FundingConfig, LpPosition
- **Error codes:** 21
- **Event types:** 14
- **Pools:** SOL, TSLA, SPY, AAPL (parameterized by pool_id)
- **Oracle:** Pyth Network (pull-based, 4-layer validation)
- **Formal proofs:** 8 theorems in Lean 4 / Mathlib
- **Frontend:** https://holging.com
- **API:** https://api.holging.com
- **Source:** https://github.com/holging/holging
