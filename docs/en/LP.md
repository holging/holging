# Holging LP — Liquidity Provider Guide

> Last updated: 2026-03-29
> Protocol: Holging (CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX)
> Network: Solana Devnet → Mainnet (in preparation)

---

## 1. What is LP in Holging?

A Liquidity Provider (LP) in Holging is a participant who **deposits USDC into the protocol's vault**, providing liquidity for shortSOL mint and redeem operations. In return, the LP receives:

- **LP tokens** — an SPL token representing a share of the pool
- **Trading fees** — 100% of fees from every mint/redeem
- **Funding Rate income** — freed USDC from k-decay

An LP in Holging is analogous to an **underwriter**: you take on counterparty risk with inverse SOL exposure in exchange for steady income.

---

## 2. How Does It Work?

### 2.1 Depositing Liquidity

```
You deposit USDC → receive LP tokens
```

- Minimum deposit: **$100 USDC**
- LP tokens are minted proportionally to your share in `lp_principal`
- Uses the **dead shares pattern** (ERC-4626) — protection against first-depositor attacks
- Formula: `shares = usdc_amount × (total_supply + 1000) / (principal + 1000)`

### 2.2 Earning Mechanics

LPs earn from **two sources**:

#### Source 1: Trading Fees (Fee APY)
Every shortSOL mint and redeem generates a fee that is **fully** distributed among LPs via a fee-per-share accumulator (precision 1e12).

| Vault State | Fee (per side) | Roundtrip | When |
|-------------|----------------|-----------|------|
| > 200% (healthy) | 2 bps (0.02%) | 0.04% | Vault is well-collateralized |
| 150–200% (normal) | 20 bps (0.20%) | 0.40% | Standard operation |
| 100–150% (elevated) | 40 bps (0.40%) | 0.80% | Stress — fees increase |
| < 100% (critical) | 80 bps (0.80%) | 1.60% | Vault auto-protection |

> Dynamic fees are a built-in stabilizer: under vault stress, high fees slow down redemptions and attract new mints, restoring pool health.

#### Source 2: Funding Rate (k-Decay APY)
The protocol applies continuous decay to the `k` parameter (10 bps/day by default). This reduces the vault's obligations to shortSOL holders, and the difference (freed USDC) is distributed to LPs.

```
k_new = k_old × (864,000,000 − rate × elapsed) / 864,000,000
```

- **10 bps/day** = 0.10%/day = **30.59% compounded/year**
- This income is **independent of trading volume** — it's the floor yield for LPs
- Funding compensates for the vault's counterparty risk

### 2.3 Withdrawing Liquidity

```
Burn LP tokens → receive USDC proportional to principal
Call claim_lp_fees → receive accumulated fees
```

- Principal withdrawal and fee claims are **separate operations** (by design: fees don't affect share price)
- Upon withdrawal, vault health is checked: the remaining balance must be ≥ **110% of obligations**
- If the vault is undercollateralized — withdrawal is blocked (this protects other LPs and users)

---

## 3. Yields (APY)

### 3.1 Yield Model

| Source | Formula | Depends On |
|--------|---------|------------|
| **Fee APY** | `daily_volume × roundtrip_fee × 365 / TVL` | Trading volume |
| **Funding APY** | `TVL × 0.001 × 365 / TVL = 36.50%` | Constant (floor yield) |
| **Total APY** | Fee APY + Funding APY | |

### 3.2 Projected Scenarios

With a healthy vault (>200%, roundtrip fee = 0.04%):

| Scenario | TVL | Daily Volume | Fee APY | Funding APY | **Total APY** |
|----------|-----|-------------|---------|-------------|---------------|
| Conservative | $100K | $10K | 1.46% | 36.50% | **37.96%** |
| Moderate | $500K | $100K | 2.92% | 36.50% | **39.42%** |
| Aggressive | $2M | $500K | 3.65% | 36.50% | **40.15%** |

With a stressed vault (150–200%, roundtrip fee = 0.40%):

| Scenario | TVL | Daily Volume | Fee APY | Funding APY | **Total APY** |
|----------|-----|-------------|---------|-------------|---------------|
| Conservative | $100K | $10K | 14.60% | 36.50% | **51.10%** |
| Moderate | $500K | $100K | 29.20% | 36.50% | **65.70%** |
| Aggressive | $2M | $500K | 36.50% | 36.50% | **73.00%** |

### 3.3 Key Insight

**Funding APY (36.5%) is the guaranteed minimum**, independent of trading volume. Even with zero volume, LPs earn ~36.5% annually from k-decay. Fee APY is a bonus on top, depending on user activity.

> For comparison: JLP on Jupiter yields 15–25% APY, Drift DLP ~10–20% APY, Kamino vaults 5–15% APY.

---

## 4. Risks for LPs

### 🔴 Risk 1: Vault Stress During SOL Price Decline (HIGH)

**Summary:** When SOL drops, shortSOL appreciates (`shortSOL_price = k / SOL_price`). The vault's obligations to shortSOL holders increase while the USDC in the vault remains the same.

**Example:**
- LP deposited $100,000 USDC when SOL = $170
- Users minted shortSOL worth $50,000
- SOL drops to $85 (−50%): shortSOL doubles in price
- Vault obligations: $50,000 → $100,000
- Vault ratio: $150,000 / $100,000 = 150% (stressed but not critical)

**Critical thresholds:**
- Vault ratio < 95% → Circuit Breaker: all redemptions blocked
- Vault ratio < 110% → LP withdrawal blocked

**Protective mechanisms:**
- ✅ Circuit Breaker (95%) — automatic pause until recovery
- ✅ Dynamic fees — increase up to 80 bps under stress, attracting new mints
- ✅ Funding Rate (k-decay) — continuously reduces obligations
- ✅ LP withdrawal blocked at ratio < 110% — protection against bank runs

**What this means for LPs:** In an extreme scenario (SOL −80%+), your USDC may be temporarily locked in the vault until the price recovers or new LPs join.

---

### 🟡 Risk 2: Impermanent Loss from k-Decay (MEDIUM)

**Summary:** k-decay reduces shortSOL_price when the SOL price is unchanged. This is good for LPs (reduces obligations), but if SOL drops more than k-decay can compensate — the LP incurs a loss.

**Formula for potential LP loss:**
```
LP_loss = obligations_at_current_price − vault_balance
        = (circulating × k / SOL_price / 1e12) − vault_USDC
```

**Protection:** k-decay acts as built-in insurance — ~0.1%/day of obligations are automatically reduced, even if SOL doesn't move.

---

### 🟡 Risk 3: Smart Contract Risk (MEDIUM)

**Summary:** The protocol is deployed on Solana. Any bug in the program could lead to loss of funds.

**Current protections:**
- ✅ Checked arithmetic (all operations with overflow protection)
- ✅ Vault reconciliation (`reload()` + assert after every CPI transfer)
- ✅ 19 instructions, 21 error codes, 17 event types
- ✅ 4-level Pyth oracle validation
- ✅ Rate limiting (2 sec between operations)
- ✅ Two-step authority transfer
- ✅ Dead shares (ERC-4626) — protection against share inflation
- ✅ MIN_K floor — protection against k→0

**Not yet addressed:**
- ⚠️ Professional audit (OtterSec/Neodyme) — planned before mainnet
- ⚠️ No timelock on admin parameters (admin can instantly change fee, funding rate)
- ⚠️ Program is on devnet — not tested under mainnet load

---

### 🟡 Risk 4: Oracle Risk (MEDIUM)

**Summary:** The shortSOL price is determined by the Pyth oracle. An oracle error or manipulation = incorrect mint/redeem.

**4-level protection:**

| Check | Threshold | What it filters out |
|-------|-----------|---------------------|
| Staleness | 30s (mainnet) / 86400s (devnet) | Stale data |
| Confidence | CI < 2% of price | Inaccurate data |
| Deviation | < 15% from cache | Sharp spikes / manipulation |
| Floor | > $1.00 | Zero / negative prices |

**Residual risk:** Pyth is the sole oracle, no fallback. Pyth downtime = protocol pause.

---

### 🟢 Risk 5: Admin Risk (LOW)

**Summary:** The admin can change parameters: fee, funding rate, min LP deposit, pause.

**What the admin can do:**
| Action | Limitation |
|--------|------------|
| Change fee | Max 100 bps (1%) |
| Change funding rate | Max 100 bps/day |
| Withdraw fees | Only excess above 110% obligations + LP principal + LP pending fees |
| Pause protocol | In both directions |
| Transfer authority | Two-step: propose → accept |

**What the admin CANNOT do:**
- ❌ Withdraw LP principal (protected in `withdraw_fees`)
- ❌ Withdraw pending LP fees (protected in `withdraw_fees`)
- ❌ Change k when circulating > 0
- ❌ Mint/withdraw shortSOL directly

---

### 🟢 Risk 6: Liquidity Lock (LOW)

**Summary:** LPs cannot withdraw funds if vault health < 110%.

**When this happens:** Only during a significant SOL price decline when vault obligations approach the balance. Under normal conditions, liquidity is fully available.

**Protection:** The circuit breaker at 95% halts new redemptions, stabilizing the vault and allowing LPs to withdraw after recovery.

---

## 5. Comparison with Alternatives

| Parameter | Holging LP | JLP (Jupiter) | DLP (Drift) | Kamino Vaults |
|-----------|-----------|--------------|------------|---------------|
| **Base APY** | ~37–40% | 15–25% | 10–20% | 5–15% |
| **Floor yield** | 36.5% (funding) | 0% (fees only) | 0% (fees only) | 0% |
| **IL risk** | Yes (on SOL decline) | Yes (trader PnL) | Yes (AMM PnL) | Minimal |
| **LP liquidation** | No | No | No | No |
| **Lock-up** | No (but vault health check) | No | No | Some vaults |
| **Min. deposit** | $100 | None | None | Varies |
| **Composability** | LP token (SPL) | JLP token (SPL) | Position | Vault shares |
| **Audit** | In progress | Yes (OtterSec) | Yes (OtterSec) | Yes |

---

## 6. How to Become an LP

### 6.1 Via Frontend (holging.com)

1. Connect your wallet (Phantom / Solflare) — set to **Devnet**
2. Get test USDC via Faucet (button on the site)
3. Navigate to the **LP Dashboard** section
4. Enter the amount (min. $100 USDC) and click **Add Liquidity**
5. Confirm the transaction in your wallet
6. Your LP tokens will appear in your wallet

### 6.2 Via CLI (for advanced users)

```bash
# Add liquidity (10,000 USDC)
npx ts-node scripts/add-liquidity.ts --amount 10000

# Check position
# LP position PDA: ["lp_position", pool_state, your_pubkey]

# Claim accumulated fees
# claim_lp_fees via program.methods.claimLpFees(POOL_ID)

# Remove liquidity (50% shares)
# remove_liquidity via program.methods.removeLiquidity(POOL_ID, halfShares)
```

### 6.3 LP Operations

| Operation | Instruction | Who can call | Fee |
|-----------|-------------|--------------|-----|
| Deposit USDC | `add_liquidity` | Anyone (permissionless) | None |
| Withdraw USDC | `remove_liquidity` | LP position owner | None (but vault health check) |
| Claim fees | `claim_lp_fees` | LP position owner | None |

---

## 7. FAQ

### Can I lose my deposit?

**Partially — yes.** In an extreme scenario (SOL −80%+ over a short period, before the circuit breaker activates), vault obligations may exceed the balance. In that case, your proportional withdrawal would be less than your deposit. However:
- Funding rate (k-decay) continuously reduces obligations, mitigating this risk
- Circuit breaker halts redemptions at ratio < 95%
- Dynamic fees automatically increase under vault stress

### When do I earn income?

**Continuously.** Fees are accrued to your `pending_fees` with every mint/redeem in the protocol. Funding rate income is added with every `accrue_funding` call (keeper runs hourly, or inline during mint/redeem). You can claim accumulated fees at any time via `claim_lp_fees`.

### What happens during a circuit breaker event?

All redeem operations are blocked. Mint operations **remain available** — this allows new users to deposit USDC and restore the vault ratio. Once the ratio exceeds 95%, redemptions resume automatically (admin lifts the pause).

### Can I withdraw funds at any time?

**Yes, if vault ratio ≥ 110%.** If the ratio is lower — withdrawal is blocked until recovery. Fee claims are always available (as long as the protocol is not paused and there is USDC in the vault).

### What guarantees exist against an admin rugpull?

- Admin **cannot** withdraw LP principal or pending fees (protected in `withdraw_fees`)
- Admin **cannot** change k when circulating > 0
- Admin authority transfer is **two-step** (propose + accept)
- All admin actions emit on-chain events for monitoring

### How does this differ from JLP on Jupiter?

JLP acts as the counterparty for leveraged traders: LPs earn when traders lose, and vice versa. In Holging, LPs earn a **stable funding rate (36.5% APY)** + trading fees, but bear counterparty risk of inverse SOL exposure. The key difference is floor yield: Holging LPs earn even with zero trading volume.

---

## 8. Contacts and Resources

- **Website:** [holging.com](https://holging.com)
- **Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
- **Math:** [SOLSHORT_MATH.md](../SOLSHORT_MATH.md)
- **Security Audit:** [docs/SECURITY_AUDIT.md](SECURITY_AUDIT.md)
- **Business Analysis:** [docs/BUSINESS_ANALYSIS.md](BUSINESS_ANALYSIS.md)

---

*This document is for informational purposes only and does not constitute financial advice. All APYs are projections based on current protocol parameters and are subject to change. DeFi carries the risk of loss of funds.*
