# Holging — Mathematical Architecture

## Overview

Holging is a tokenized inverse-exposure protocol on Solana. Users deposit USDC to mint **shortSOL** tokens whose value moves inversely to SOL price. The core innovation is the **holging** strategy — a 50/50 portfolio of SOL + shortSOL that is mathematically guaranteed to be profitable regardless of price direction.

**Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
**Network:** Devnet

---

## 1. Constants

| Symbol | Value | Description |
|--------|-------|-------------|
| `PRICE_PRECISION` | 10⁹ | Fixed-point scaling factor |
| `USDC_DECIMALS` | 6 | 1 USDC = 10⁶ base units |
| `SHORTSOL_DECIMALS` | 9 | 1 shortSOL = 10⁹ base units |
| `DECIMAL_SCALING` | 10³ | = 10^(9−6), converts USDC↔shortSOL |
| `BPS_DENOMINATOR` | 10,000 | Basis points denominator |
| `DEFAULT_FEE_BPS` | 4 | 0.04% fee |
| `MIN_VAULT_RATIO_BPS` | 9,500 | Circuit breaker at 95% |
| `MIN_VAULT_POST_WITHDRAWAL_BPS` | 11,000 | Admin withdrawal floor at 110% |
| `MAX_PRICE_DEVIATION_BPS` | 1,500 | 15% max deviation from cache |
| `MAX_CONFIDENCE_PCT` | 2 | 2% oracle confidence interval |
| `MAX_STALENESS_SECS` | 120 | 120s oracle freshness (devnet) |
| `MIN_PRICE` | 10⁹ | Floor: $1.00 SOL |
| `SECS_PER_DAY` | 86,400 | Seconds per day (funding rate denominator) |
| `MAX_FUNDING_RATE_BPS` | 100 | Max k-decay: 1%/day ≈ 97% compound/year |
| `MAX_FUNDING_ELAPSED_SECS` | 2,592,000 | Max elapsed per `accrue_funding` call (30 days) |

---

## 2. Core Pricing Function

### 2.1 shortSOL Price

The shortSOL price is an inverse (reciprocal) function of SOL price:

$$
\text{shortSOL\_price}(t) = \frac{k \times \text{PRICE\_PRECISION}}{P_{\text{SOL}}(t)}
$$

Where:
- $P_{\text{SOL}}(t)$ — current SOL/USD price (scaled ×10⁹)
- $k$ — normalizing constant (u128)

### 2.2 Constant k (initialization)

$$
k = \frac{P_0^2}{\text{PRICE\_PRECISION}}
$$

Where $P_0$ is SOL price at pool initialization.

**Property:** At initialization, shortSOL starts at the same price as SOL:

$$
\text{shortSOL}(0) = \frac{k \times \text{PRICE\_PRECISION}}{P_0} = \frac{P_0^2 / \text{PRICE\_PRECISION} \times \text{PRICE\_PRECISION}}{P_0} = P_0
$$

### 2.3 k is Return-Neutral

Returns are independent of k:

$$
\text{Return} = \frac{\text{shortSOL}(t_1)}{\text{shortSOL}(t_0)} - 1 = \frac{k / P_1}{k / P_0} - 1 = \frac{P_0}{P_1} - 1
$$

Two pools with different k produce identical percentage returns.

---

## 3. Mint (USDC → shortSOL)

### 3.1 Fee Deduction

$$
\text{fee} = \frac{\text{usdc\_amount} \times \text{fee\_bps}}{10{,}000}
$$

$$
\text{effective\_usdc} = \text{usdc\_amount} - \text{fee}
$$

### 3.2 Tokens Minted

$$
\text{tokens} = \frac{\text{effective\_usdc} \times \text{DECIMAL\_SCALING} \times \text{PRICE\_PRECISION}}{\text{shortSOL\_price}}
$$

Expanded:

$$
\text{tokens} = \frac{\text{effective\_usdc} \times 10^3 \times 10^9}{\text{shortSOL\_price}}
$$

### 3.3 State Updates

```
circulating     += tokens
total_minted    += tokens
vault_balance   += usdc_amount    ← full amount (fee stays in vault)
fees_collected  += fee
```

### 3.4 Numerical Example

SOL = $170, k = 28,900 × 10⁹, user deposits 170 USDC:

```
shortSOL_price = 28,900×10⁹ × 10⁹ / (170×10⁹) = 170×10⁹
fee = 170,000,000 × 4 / 10,000 = 68,000 (= $0.068)
effective_usdc = 170,000,000 − 68,000 = 169,932,000
tokens = 169,932,000 × 1,000 × 10⁹ / (170×10⁹) = 999,600,000 (≈ 0.9996 shortSOL)
```

---

## 4. Redeem (shortSOL → USDC)

### 4.1 Gross USDC Out

$$
\text{gross\_usdc} = \frac{\text{shortsol\_amount} \times \text{shortSOL\_price}}{\text{PRICE\_PRECISION} \times \text{DECIMAL\_SCALING}}
$$

### 4.2 Fee (Bid Side)

$$
\text{fee} = \frac{\text{gross\_usdc} \times \text{fee\_bps}}{10{,}000}
$$

$$
\text{net\_usdc} = \text{gross\_usdc} - \text{fee}
$$

### 4.3 State Updates

```
circulating     -= shortsol_amount
total_redeemed  += shortsol_amount
vault_balance   -= net_usdc       ← fee remains in vault
fees_collected  += fee
```

### 4.4 Effective Spread

$$
\text{Spread} = \text{Ask} - \text{Bid} = \text{shortSOL\_price} \times \frac{2 \times \text{fee\_bps}}{10{,}000} = \text{shortSOL\_price} \times 0.08\%
$$

---

## 5. Oracle Validation

### 5.1 Pyth Price Conversion

Pyth returns `(price, exponent)`. Example: price=17250, expo=−2 means $172.50.

$$
\text{adjusted\_price} = \begin{cases}
\text{raw\_price} \times 10^{\text{expo}} \times \text{PRICE\_PRECISION} & \text{if expo} \geq 0 \\
\frac{\text{raw\_price} \times \text{PRICE\_PRECISION}}{10^{|\text{expo}|}} & \text{if expo} < 0
\end{cases}
$$

### 5.2 Confidence Check

$$
\text{conf\_pct} = \frac{\text{adjusted\_conf} \times 100}{\text{adjusted\_price}} < 2\%
$$

### 5.3 Deviation Check (vs cached price)

$$
\text{deviation\_bps} = \frac{|\text{adjusted\_price} - \text{last\_cached\_price}| \times 10{,}000}{\text{last\_cached\_price}} \leq 1{,}500
$$

### 5.4 Safety Guards Summary

| Guard | Condition | Error |
|-------|-----------|-------|
| Staleness | age > 120s | `StaleOracle` |
| Confidence | conf > 2% of price | `OracleConfidenceTooWide` |
| Deviation | Δ > 15% from cache | `PriceDeviationTooHigh` |
| Floor | price < $1.00 | `PriceBelowMinimum` |

---

## 6. Circuit Breaker

### 6.1 Vault Obligations

After a redemption, the remaining obligations are:

$$
\text{obligations} = \frac{\text{remaining\_circulating} \times \text{shortSOL\_price}}{\text{PRICE\_PRECISION} \times \text{DECIMAL\_SCALING}}
$$

### 6.2 Vault Ratio

$$
\text{vault\_ratio\_bps} = \frac{\text{remaining\_vault} \times 10{,}000}{\text{obligations}}
$$

### 6.3 Trigger

$$
\text{vault\_ratio\_bps} < 9{,}500 \implies \text{pool.paused} = \texttt{true}
$$

Transaction is rejected with `CircuitBreaker` error.

### 6.4 Solvency Analysis

After a single mint at price $P_0$ and price change to $P_1$:

$$
\text{ratio} = \frac{P_1}{P_0} \times (1 + \text{fee})
$$

- If $P_1 > P_0$ (SOL up): ratio > 1, overcollateralized ✓
- If $P_1 < P_0$ (SOL down): vault stress increases
- Circuit breaker triggers before ratio drops below 95%

---

## 7. Holging Strategy

### 7.1 Portfolio Definition

Holging = 50% SOL + 50% shortSOL (equal dollar allocation).

Let $x = P(t) / P(0)$ be the SOL price multiplier:

$$
V(x) = \frac{1}{2} \cdot x + \frac{1}{2} \cdot \frac{1}{x} = \frac{x + 1/x}{2}
$$

### 7.2 AM-GM Guarantee

By the Arithmetic Mean–Geometric Mean inequality:

$$
\frac{x + 1/x}{2} \geq \sqrt{x \cdot \frac{1}{x}} = 1 \quad \forall\, x > 0
$$

**Therefore:** $V(x) \geq 1$ always. The portfolio never loses value (pre-fees).

### 7.3 P&L Formula

$$
\text{P\&L}(x) = V(x) - 1 = \frac{x + 1/x}{2} - 1 = \frac{(x - 1)^2}{2x}
$$

Minimum at $x = 1$ (no price change), $\text{P\&L} = 0$.

### 7.4 Derivatives (Greeks)

First derivative (delta):
$$
\frac{dV}{dP} = \frac{1}{2P_0} - \frac{P_0}{2P^2}
$$

At $P = P_0$: delta = 0 (delta-neutral).

Second derivative (gamma):
$$
\frac{d^2V}{dP^2} = \frac{P_0}{P^3} > 0 \quad \forall\, P > 0
$$

**Positive gamma everywhere** — portfolio benefits from volatility in either direction.

### 7.5 Scenario Table

| SOL Δ | x | SOL P&L | shortSOL P&L | Portfolio P&L |
|-------|---|---------|-------------|---------------|
| −90% | 0.10 | −90.0% | +900.0% | **+405.0%** |
| −75% | 0.25 | −75.0% | +300.0% | **+56.3%** |
| −50% | 0.50 | −50.0% | +100.0% | **+25.0%** |
| −25% | 0.75 | −25.0% | +33.3% | **+4.2%** |
| −10% | 0.90 | −10.0% | +11.1% | **+0.6%** |
| 0% | 1.00 | 0.0% | 0.0% | **0.0%** |
| +10% | 1.10 | +10.0% | −9.1% | **+0.5%** |
| +25% | 1.25 | +25.0% | −20.0% | **+2.5%** |
| +50% | 1.50 | +50.0% | −33.3% | **+8.3%** |
| +100% | 2.00 | +100.0% | −50.0% | **+25.0%** |
| +200% | 3.00 | +200.0% | −66.7% | **+66.7%** |

### 7.6 Real P&L (with fees)

$$
\text{Real P\&L} = \frac{(x-1)^2}{2x} - 2 \times \text{fee\_roundtrip} - \text{gas}
$$

With fee_bps = 4: roundtrip cost = 0.08%. Break-even requires:

$$
\frac{(x-1)^2}{2x} > 0.0008
$$

Approximately: SOL must move ±4% for profit after fees.

---

## 8. Token Decimal Handling

### 8.1 Conversion Table

| Token | Decimals | 1 unit = | Base unit name |
|-------|----------|----------|----------------|
| USDC | 6 | 1,000,000 base units | "USDC lamports" |
| shortSOL | 9 | 1,000,000,000 base units | "shortSOL lamports" |
| SOL | 9 | 1,000,000,000 lamports | lamports |

### 8.2 Scaling Factor

$$
\text{DECIMAL\_SCALING} = 10^{(\text{SHORTSOL\_DEC} - \text{USDC\_DEC})} = 10^{(9-6)} = 1{,}000
$$

Used in both mint (multiply) and redeem (divide) to bridge the decimal gap.

---

## 9. Pool State

```
PoolState {
    authority:            Pubkey     // Admin key
    pending_authority:    Pubkey     // Proposed new admin (two-step transfer)
    k:                    u128       // Pricing constant (k-decay applied by funding rate)
    fee_bps:              u16        // Fee in basis points
    total_minted:         u64        // Cumulative tokens minted
    total_redeemed:       u64        // Cumulative tokens redeemed
    circulating:          u64        // Current supply (minted − redeemed)
    total_fees_collected: u64        // Accumulated fees (USDC)
    vault_balance:        u64        // USDC in vault
    pyth_feed:            Pubkey     // Oracle feed address
    shortsol_mint:        Pubkey     // Token mint address
    paused:               bool       // Emergency stop
    last_oracle_price:    u64        // Cached SOL price
    last_oracle_timestamp: i64       // Cache timestamp
    bump:                 u8         // Pool PDA bump
    mint_auth_bump:       u8         // Mint authority PDA bump
}

FundingConfig {
    rate_bps:        u16   // k-decay rate in bps/day (0 = disabled)
    last_funding_at: i64   // Unix timestamp of last accrual
    bump:            u8    // PDA bump
}
```

### Invariants

```
circulating = total_minted − total_redeemed
vault_balance = Σ(usdc_in) − Σ(net_usdc_out)
vault_balance ≥ Σ(fees)  (fees never leave the vault)
```

---

## 10. PDA Seeds

| PDA | Seeds | Purpose |
|-----|-------|---------|
| Pool State | `["pool", pool_id]` | Main state account |
| shortSOL Mint | `["shortsol_mint", pool_id]` | Token mint |
| Mint Authority | `["mint_auth", pool_id]` | Signer for minting |
| USDC Vault | `["vault", usdc_mint, pool_id]` | Holds deposited USDC |
| Funding Config | `["funding", pool_state_pubkey]` | k-decay rate + timestamp |

---

## 11. Error Codes

| Code | Name | Meaning |
|------|------|---------|
| 6000 | `Paused` | Pool is paused |
| 6001 | `StaleOracle` | Price > 30s old |
| 6002 | `OracleConfidenceTooWide` | Confidence > 2% |
| 6003 | `PriceDeviationTooHigh` | Δ > 15% from cache |
| 6004 | `InsufficientLiquidity` | Vault can't cover redemption or withdrawal |
| 6005 | `AmountTooSmall` | Amount = 0 or tokens = 0 |
| 6006 | `CircuitBreaker` | Vault ratio < 95% |
| 6007 | `RateLimitExceeded` | 2s cooldown between user actions |
| 6008 | `PriceBelowMinimum` | SOL < $1.00 |
| 6009 | `MathOverflow` | Arithmetic overflow |
| 6010 | `Unauthorized` | Wrong authority |
| 6011 | `InvalidFee` | fee_bps > 100 or rate_bps > MAX_FUNDING_RATE_BPS |
| 6012 | `CirculatingNotZero` | Can't update k with supply > 0 |
| 6013 | `InvalidPoolId` | Pool ID exceeds 32 bytes |
| 6014 | `SlippageExceeded` | Output below min_tokens_out / min_usdc_out |
| 6015 | `NoPendingAuthority` | `accept_authority` called before `transfer_authority` |

---

## 12. Events

### User Events
```
MintEvent        { user, usdc_in, tokens_out, sol_price, shortsol_price, fee, timestamp }
RedeemEvent      { user, tokens_in, usdc_out, sol_price, shortsol_price, fee, timestamp }
CircuitBreakerTriggered { vault_ratio_bps, timestamp }
```

### Admin Events
```
AddLiquidityEvent    { authority, usdc_amount, new_vault_balance }
WithdrawFeesEvent    { authority, amount, remaining_vault }
RemoveLiquidityEvent { authority, usdc_amount, remaining_vault }
PauseEvent           { paused, authority }
UpdateFeeEvent       { old_fee_bps, new_fee_bps, authority }
UpdateKEvent         { new_k, authority }
ProposeAuthorityEvent   { current_authority, proposed_authority }
TransferAuthorityEvent  { old_authority, new_authority }
```

### Funding Events
```
FundingAccruedEvent  { k_before, k_after, elapsed_secs, rate_bps, timestamp }
```

---

## 13. Funding Rate (k-Decay)

### 13.1 Mechanism

The protocol charges a continuous funding rate by decaying `k` over time. This compensates the vault for the asymmetric payout structure (shortSOL holders profit from SOL drops, but vault absorbs the loss).

$$
k_{\text{new}} = k_{\text{old}} \times \frac{\text{denom} - \text{rate\_bps} \times \text{elapsed\_to\_apply}}{\text{denom}}
$$

$$
\text{denom} = \text{SECS\_PER\_DAY} \times \text{BPS\_DENOM} = 86{,}400 \times 10{,}000 = 864{,}000{,}000
$$

### 13.2 Rate Examples

| rate_bps/day | Daily decay | Compound/year |
|---|---|---|
| 1 | 0.01% | 3.5% |
| 10 | 0.10% | 30.6% |
| 50 | 0.50% | 83.9% |
| 100 | 1.00% | 97.4% |

### 13.3 Keeper-Independence

Funding is applied **inline** on every `mint` and `redeem` call (if `FundingConfig` is passed as an optional account). This ensures users always trade at the current k, regardless of keeper activity.

### 13.4 k→0 Protection

A hard cap of **30 days** (`MAX_FUNDING_ELAPSED_SECS`) per `accrue_funding` call prevents k from collapsing to zero during keeper downtime. The timestamp advances by `elapsed_to_apply`, not by `now` — uncapped time carries over to the next call.

$$
\text{elapsed\_to\_apply} = \min(\text{elapsed}, \text{MAX\_FUNDING\_ELAPSED\_SECS})
$$

### 13.5 Effect on shortSOL Price

Since `shortSOL_price = k × 10⁹ / SOL_price`, a smaller k means a lower shortSOL price for the same SOL price. Holders who do not redeem gradually lose value through the funding rate — analogous to a perpetual funding rate in perp markets.

---

## 14. Risk Analysis

### 13.1 Vault Insolvency

If SOL drops significantly, shortSOL obligations exceed vault balance. Circuit breaker at 95% mitigates but doesn't eliminate:

$$
\text{At 50\% SOL drop: ratio} = \frac{P_1}{P_0} \times (1 + \text{fee}) = 0.5 \times 1.0004 = 0.5002
$$

Single mint → 50% collateralization. Multiple mints at varying prices improve ratio.

### 13.2 Rounding

All integer divisions round down (floor). In both mint and redeem, rounding favors the protocol. Two sequential divisions in redeem (`/ PRICE_PRECISION / scaling`) lose more precision than a single combined division.

### 13.3 Oracle

- 30s staleness window allows front-running
- Pull-based Pyth model: anyone can submit price updates
- 15% deviation check can be slowly shifted across transactions
- Single oracle, no fallback

### 13.4 Fees vs Holging Profit

Roundtrip fee = 0.08%. For small SOL moves:

$$
\text{P\&L}(1 + \epsilon) \approx \frac{\epsilon^2}{2} \quad \text{(Taylor expansion)}
$$

Break-even: $\epsilon^2 / 2 > 0.0008 \implies |\epsilon| > 4\%$

---

## 15. Formula Quick Reference

| What | Formula |
|------|---------|
| shortSOL price | $k \times 10^9 / P_{\text{SOL}}$ |
| k (init) | $P_0^2 / 10^9$ |
| k (decay) | $k_{\text{old}} \times (\text{denom} - \text{rate} \times \text{elapsed}) / \text{denom}$ |
| Funding denom | $86{,}400 \times 10{,}000 = 864{,}000{,}000$ |
| Mint fee | $\text{amount} \times \text{fee\_bps} / 10{,}000$ |
| Tokens out | $\text{effective} \times 10^3 \times 10^9 / \text{ssPrice}$ |
| USDC out | $\text{tokens} \times \text{ssPrice} / 10^9 / 10^3$ |
| Holging V(x) | $(x + 1/x) / 2$ |
| Holging P&L | $(x - 1)^2 / (2x)$ |
| Vault ratio | $\text{vault} \times 10{,}000 / \text{obligations}$ |
| Withdrawal floor | $\text{obligations} \times 11{,}000 / 10{,}000$ |
| Confidence | $\text{conf} \times 100 / \text{price} < 2\%$ |
| Deviation | $|\Delta| \times 10{,}000 / \text{cached} \leq 1{,}500$ |
