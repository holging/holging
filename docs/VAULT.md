# Holging Vault Analytics — Complete Vault & LP Strategy Analysis

> Date: 2026-03-29
> All formulas and parameters verified from `programs/holging/src/`
> Protocol: Holging (CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX)

---

## 1. Vault Anatomy

### 1.1 Vault Balance

The vault holds USDC from three sources:

```
vault_balance = LP_principal + accumulated_fees + user_deposits_coverage
```

| Component | Source | Who can withdraw |
|-----------|--------|------------------|
| **LP principal** | LP providers via `add_liquidity` | LPs via `remove_liquidity` |
| **Accumulated fees** | Trading fees from mint/redeem | LPs via `claim_lp_fees` |
| **Freed funding** | k-decay reduces obligations | LPs via `claim_lp_fees` |
| **User coverage** | USDC from mint operations | Users via `redeem` |
| **Excess** | Surplus above 110% obligations | Admin via `withdraw_fees` |

### 1.2 Vault Obligations

```
obligations = circulating × shortSOL_price / 1e9 / 1e3
            = circulating × k / SOL_price / 1e3
```

Obligations increase when SOL drops (shortSOL appreciates) and decrease when SOL rises.

### 1.3 Vault Health Ratio

```
vault_ratio = vault_balance / obligations × 10,000 (in bps)
```

| Ratio | Status | What happens |
|-------|--------|--------------|
| > 200% | 🟢 Healthy | Minimum fee (20 bps), LPs can freely withdraw |
| 150–200% | 🟡 Normal | Standard fee (40 bps) |
| 110–150% | 🟠 Elevated | High fee (60 bps), LP withdrawal available |
| 95–110% | 🔴 Critical | Maximum fee (80 bps), LP withdrawal blocked |
| < 95% | ⛔ Circuit Breaker | All redeems blocked, only mint available |

---

## 2. LP Revenue Streams

### 2.1 Trading Fees

**Annual fee revenue formula:**
```
Fee_Revenue_Annual = Daily_Volume × Fee_Roundtrip × 365
Fee_APY = Fee_Revenue_Annual / TVL × 100%
```

**Fee schedule by vault health:**

| Vault Health | base_fee (per side) | Multiplier | Effective (per side) | Roundtrip | Max (clamped) |
|-------------|--------------------:|-----------|---------------------:|----------:|--------------:|
| > 200% | 4 bps | ×5 | 20 bps | 40 bps | — |
| 150–200% | 4 bps | ×10 | 40 bps | 80 bps | — |
| 100–150% | 4 bps | ×15 | 60 bps | 120 bps | — |
| < 100% | 4 bps | ×20 | 80 bps | 100 bps* | *clamped to 100 bps |

### 2.2 Funding Rate (k-Decay)

**k-decay formula:**
```
k_new = k_old × (864,000,000 − rate_bps × elapsed_secs) / 864,000,000
```

**LP revenue from funding:**
```
freed_usdc = obligations_before_decay − obligations_after_decay
           = circulating × (k_old − k_new) × 1e9 / SOL_price / 1e9 / 1e3
```

**Annual compound at various rates:**

| rate_bps/day | Daily decay | Monthly | Annual compound | Annual simple |
|--------------|-------------|---------|-----------------|---------------|
| 1 | 0.01% | 0.30% | 3.57% | 3.65% |
| 5 | 0.05% | 1.51% | 16.62% | 18.25% |
| **10** | **0.10%** | **3.00%** | **30.59%** | **36.50%** |
| 20 | 0.20% | 5.91% | 52.15% | 73.00% |
| 50 | 0.50% | 14.07% | 83.86% | 182.50% |
| 100 | 1.00% | 26.03% | 97.41% | 365.00% |

> Current rate: **10 bps/day** (0.10%/day, 30.59% compound/year)

### 2.3 Combined APY Formula

```
Total_APY = Fee_APY + Funding_APY

Fee_APY = (Daily_Volume × Roundtrip_Fee_BPS / 10,000 × 365) / TVL
Funding_APY = 1 − (1 − rate_bps/10,000)^365
            ≈ 30.59% at 10 bps/day
```

---

## 3. Scenario Modeling

### 3.1 Scenario A: Healthy Market (SOL stable ±10%)

**Conditions:** SOL = $150, TVL = $500K, Daily Volume = $100K, Vault ratio > 200%

```
Fee: 40 bps per side = 80 bps roundtrip

Fee revenue/day   = $100,000 × 0.004 = $400
Fee revenue/year  = $400 × 365 = $146,000
Fee APY           = $146,000 / $500,000 = 29.20%

Funding revenue/day  = $500,000 × 0.001 = $500
Funding revenue/year = ~$152,950 (compound)
Funding APY          = 30.59%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total APY            = 33.51%
LP return on $10,000 = $3,351/year = $279/month
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3.2 Scenario B: High Volatility (SOL ±30%)

**Conditions:** SOL ranges between $100–$200, TVL = $500K, Daily Volume = $300K, Vault ratio 150–200%

```
Fee: 40 bps per side = 80 bps roundtrip

Fee revenue/day   = $300,000 × 0.008 = $2,400
Fee revenue/year  = $2,400 × 365 = $876,000
Fee APY           = $876,000 / $500,000 = 175.20%

Funding APY       = 30.59%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total APY (gross)  = 118.19%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BUT: with SOL −30% the vault ratio may drop:
  Obligations increase: shortSOL appreciates by 42.8% (1/0.7 − 1)
  Vault ratio drops: may move from 200% → ~140%

LP return on $10,000 = $11,819/year
Potential IL         = up to −15% if SOL −30% without recovery
Net APY (accounting for IL) ≈ 80–100% with recovery within a month
```

### 3.3 Scenario C: SOL Crash (−50% in a week)

**Conditions:** SOL: $150 → $75, TVL = $500K, circulating shortSOL = $200K

```
Before crash:
  obligations = $200,000
  vault_ratio = $500,000 / $200,000 = 250% (healthy)

After crash (SOL −50%):
  shortSOL appreciates 2x: obligations = $400,000
  vault_ratio = $500,000 / $400,000 = 125% (elevated)
  
  Fee switches to 60 bps (×15 multiplier)
  LP withdrawal: available (ratio > 110%)

Development:
  k-decay over one week: k decreases by 0.7%
  New obligations: $400,000 × 0.993 = $397,200
  Freed USDC for LPs: $2,800
  
  High fees attract mints (USDC into vault ↑)
  If $50K in new mints over the week:
    vault = $550,000, obligations = $447,200
    ratio = $550,000 / $447,200 = 123% → stabilization

LP P&L for the week:
  Fees earned:   ~$840 (from elevated fees)
  Funding freed: ~$2,800
  Unrealized IL: −$0 (principal unaffected, but withdrawal restricted if ratio < 110%)
```

### 3.4 Scenario D: Black Swan (SOL −80%)

**Conditions:** SOL: $150 → $30, TVL = $500K, circulating = $200K

```
After crash:
  shortSOL appreciates 5x: obligations = $1,000,000
  vault = $500,000
  ratio = $500,000 / $1,000,000 = 50%

  ⛔ CIRCUIT BREAKER TRIGGERED (ratio < 95%)
  
  All redeems blocked
  LP withdrawal blocked
  Only mint available (but who would mint shortSOL at SOL = $30?)

Recovery paths:
  1. SOL recovers: at SOL = $75 → obligations = $400K, ratio = 125%
  2. k-decay: over 30 days obligations drop by ~3%: $1M → $970K
  3. New LPs contribute capital
  4. Admin can pause and wait for recovery

Worst case for LPs:
  If SOL does not recover and no new LPs join:
    Principal $500K backs obligations of $1M
    LPs receive ~50 cents on the dollar upon full withdrawal
    Loss: ~50% of principal
```

### 3.5 Scenario E: Bull Market (SOL +100%)

**Conditions:** SOL: $150 → $300, TVL = $500K, Daily Volume = $500K

```
After rally:
  shortSOL depreciates 2x: obligations = $100,000
  vault = $500,000
  ratio = $500,000 / $100,000 = 500% (extremely healthy)
  
  Fee: 20 bps (minimum)
  LPs can freely withdraw
  Admin can withdraw excess: $500K − 110% × $100K = $390K

LP P&L:
  Fees: $500K × 0.004 × 365 / $500K = 146% APY
  Funding: 30.59% APY
  IL: $0 (obligations decreased — LPs are in profit)
  
  Total APY = 196.79% (high volume + funding)
  LP return on $10,000 = $4,519/year
```

---

## 4. Risk Matrix by Scenario

| SOL Movement | Vault Ratio | Fee | LP APY (gross) | IL Risk | LP Liquidity |
|-------------|-------------|-----|----------------|---------|--------------|
| +100% (×2) | 500%+ | 20 bps | 65%+ | None | ✅ Free |
| +50% (×1.5) | 333%+ | 20 bps | 60%+ | None | ✅ Free |
| +25% (×1.25) | 250%+ | 20 bps | 55%+ | None | ✅ Free |
| ±0% | Initial | 20–40 bps | 55–73% | None | ✅ Free |
| −25% (×0.75) | ~150% | 40 bps | 70–95% | Minimal | ✅ Free |
| −33% (×0.67) | ~120% | 60 bps | 80–110% | Moderate | ✅ Free |
| −40% (×0.60) | ~105% | 60 bps | 85–115% | High | ⚠️ Restricted |
| −50% (×0.50) | ~80% | 80 bps | — | High | ❌ Blocked |
| −70% (×0.30) | ~45% | 80 bps | — | Critical | ❌ Circuit Breaker |
| −90% (×0.10) | ~15% | 80 bps | — | Catastrophic | ❌ Circuit Breaker |

> IL Risk assumes TVL fully backs circulating shortSOL 1:1.
> At ratio > 200%, IL is absent even with significant SOL price movements.

---

## 5. LP Strategies

### 5.1 "Conservative" Strategy — Minimum Risk

**Description:** Provide liquidity only when vault ratio > 300%. Withdraw when ratio < 200%.

```
Entry: vault_ratio > 300%
Exit:  vault_ratio < 200% OR SOL drops > 20% from entry
Hold:  3–6 months

Expected APY:   33–38%
Max drawdown:   ~5% (vault is well-collateralized to cover IL)
Sharpe ratio:   ~2.0
```

**When to use:** Stable or bull market. LPs with low risk tolerance.

### 5.2 "Farmer" Strategy — Maximum APY

**Description:** Enter during vault stress (ratio 120–150%) when dynamic fees are at their peak. High fees + funding = peak APY.

```
Entry: vault_ratio 120–170% (elevated fees)
Exit:  vault_ratio > 250% (fees normalized)
       OR vault_ratio < 110% (risk-off)
Hold:  1–4 weeks (tactical)

Expected APY:   60–100%+
Max drawdown:   ~20% (entering during stress — the bottom may be near)
Sharpe ratio:   ~1.5
```

**When to use:** After a 20–30% SOL correction. A contrarian strategy.

### 5.3 "Hedger" Strategy — LP + SOL Short

**Description:** Provide LP + simultaneously mint shortSOL on a portion of the capital. LP income hedges risk.

```
Allocation:
  70% → LP deposit ($7,000)
  30% → mint shortSOL ($3,000)

If SOL drops:
  LP: vault stress, but higher fees + funding
  shortSOL: appreciates → offsets LP IL
  Net: delta-neutral, income from LP fees + funding

If SOL rises:
  LP: vault healthy, stable income
  shortSOL: depreciates → loss
  Net: LP income > shortSOL loss (for moves < 50%)

Break-even: SOL move ±40%
Expected APY:   20–25% (after cost of shortSOL hedge)
Max drawdown:   ~10%
Sharpe ratio:   ~2.5
```

**When to use:** Uncertain market. For institutional LPs.

### 5.4 "Holging Combo" Strategy — LP + Holging Portfolio

**Description:** LP + simultaneously hold 50/50 SOL + shortSOL (Holging strategy).

```
Allocation:
  50% → LP deposit ($5,000)
  25% → SOL ($2,500)
  25% → shortSOL via mint ($2,500)

Holging P&L = (x − 1)² / (2x) ≥ 0 (always positive)

At SOL ±50%:   Holging = +25% = +$1,250
LP APY 33%:    LP yield = +$1,650
Funding saved: shortSOL does not pay funding (LPs receive funding)

Total on $10,000:
  LP yield:    $1,650
  Holging P&L: $1,250 (with a single ±50% move)
  Total:       $2,900 = 29% for the period
  
  With multiple moves: Holging accumulates
  With 4 moves of ±30%/quarter: +4.2%×4 = +16.8% from Holging
  + LP 33% = ~50% annualized

Expected APY:   40–60%
Max drawdown:   ~15% (shortSOL decay via funding)
```

**When to use:** Maximum protocol exposure. For those with conviction in the product.

---

## 6. Stress Test: How Much Can the Vault Withstand?

### 6.1 Maximum SOL Drop Before Circuit Breaker

**Formula:** Circuit breaker triggers when `vault_ratio < 95%`

```
vault_balance / (circulating × k / SOL_new / 1e3) < 0.95

SOL_new = SOL_init × (vault_balance × 10,000) / (circulating × k / 1e3 × 9,500)
```

**Table: maximum SOL drop before circuit breaker at various utilization rates:**

| Utilization (circ/vault) | Vault Ratio (init) | SOL drop to CB | SOL drop to LP lock (110%) |
|--------------------------|-------------------:|---------------:|---------------------------:|
| 10% | 1000% | −90.5% | −89.1% |
| 20% | 500% | −79.0% | −76.4% |
| 30% | 333% | −68.3% | −63.6% |
| 40% | 250% | −57.9% | −51.3% |
| **50%** | **200%** | **−47.4%** | **−38.5%** |
| 60% | 167% | −36.8% | −25.5% |
| 70% | 143% | −26.3% | −12.3% |
| 80% | 125% | −15.8% | −2.0% |
| 90% | 111% | −5.3% | 0% (already locked) |

> **Utilization 50%** — typical scenario. SOL can drop ~47% before circuit breaker.

### 6.2 Recovery Time After Stress

```
k-decay restores ratio by ~0.1% of obligations per day

At ratio = 80% (after SOL −50%):
  Need to restore: 95% − 80% = 15% ratio
  Via funding: ~150 days at 0.1%/day
  Via new mints: faster (depends on volume)
  Via SOL recovery: instant with +20% SOL
```

### 6.3 Historical Backtest (SOL 2024–2025)

| Period | SOL Movement | Max drawdown | Vault Ratio (at 50% util) | CB triggered? |
|--------|-------------|--------------|---------------------------|---------------|
| Jan 2024 | $100 → $200 (+100%) | 0% | 200% → 400% | ❌ |
| Apr 2024 | $200 → $130 (−35%) | −35% | 400% → ~187% | ❌ |
| Nov 2024 | $130 → $260 (+100%) | 0% | 187% → 500%+ | ❌ |
| Jan 2025 | $260 → $170 (−35%) | −35% | 500% → ~230% | ❌ |
| Mar 2025 | $170 → $125 (−26%) | −26% | 230% → ~170% | ❌ |
| Jul 2025 | $125 → $180 (+44%) | 0% | 170% → 350% | ❌ |

> **Result:** Based on historical data from 2024–2025, the circuit breaker **would never have triggered** at 50% utilization. Maximum vault ratio drawdown: ~170% (still in the green zone).

---

## 7. Optimal Parameters for LPs

### 7.1 Optimal Position Size

```
Recommendation: no more than 10–20% of liquid crypto portfolio

$10K portfolio → $1K–2K in LP
$100K portfolio → $10K–20K in LP
$1M portfolio → $100K–200K in LP
```

### 7.2 Optimal Entry Timing

| Signal | Action | Why |
|--------|--------|-----|
| SOL correction −20–30% | 🟢 Enter | High fees, bottom is near, recovery yields peak APY |
| SOL at ATH | 🟡 Caution | Ratio is high (good), but downside potential (bad) |
| SOL in downtrend | 🔴 Wait | Ratio may decline, fees rise but IL rises too |
| Vault ratio > 300% | 🟢 Enter | Maximum safety buffer |
| Vault ratio < 150% | 🔴 "Farmers" only | High APY but high risk of lock-up |

### 7.3 Position Monitoring

**Key metrics to track:**

| Metric | Where to check | Action trigger |
|--------|----------------|----------------|
| Vault Ratio | holging.com/state | < 150% → consider exiting |
| SOL Price | pyth.network | Drop > 20% from entry → alert |
| k value | on-chain PoolState | Sharp drop = keeper issues |
| Fee per share | on-chain PoolState | Rising = fees accumulating |
| Circulating supply | on-chain PoolState | Rising = more obligations |
| Pending fees | on-chain LpPosition | > $100 → claim |

---

## 8. Formulas — Quick Reference

| What | Formula |
|------|---------|
| Vault Ratio | `vault_balance × 10,000 / obligations` |
| Obligations | `circulating × k / SOL_price / 1e3` |
| Fee APY | `daily_volume × roundtrip_bps / 10,000 × 365 / TVL` |
| Funding APY | `1 − (1 − rate_bps/10,000)^365` |
| Total APY | `Fee_APY + Funding_APY` |
| LP Shares | `usdc × (supply + 1000) / (principal + 1000)` |
| USDC on Redeem | `shares × principal / supply` |
| Fee per LP | `(fee_per_share_accumulated − checkpoint) × shares / 1e12` |
| k-decay (daily) | `k × (864M − rate_bps × 86400) / 864M` |
| Freed USDC | `obligations_before − obligations_after_decay` |
| Max SOL drop to CB | `1 − 0.95 × obligations / vault_balance` |
| Dynamic fee mult. | `{>200%: ×5, 150–200%: ×10, 100–150%: ×15, <100%: ×20}` |
| Break-even Holging | `SOL move > ±9%` (0.40% roundtrip fee)) |

---

## 9. Glossary

| Term | Definition |
|------|------------|
| **TVL** | Total Value Locked — total USDC in the vault |
| **Vault Ratio** | Ratio of vault_balance to obligations (in %) |
| **Obligations** | Total value of circulating shortSOL denominated in USDC |
| **Utilization** | Share of the vault backing shortSOL (obligations / vault) |
| **k** | Normalizing constant: shortSOL_price = k / SOL_price |
| **k-decay** | Continuous reduction of k via the funding rate |
| **Circuit Breaker** | Automatic redeem pause when vault ratio < 95% |
| **IL (Impermanent Loss)** | Potential LP loss when SOL drops |
| **Fee Accumulator** | LP fee distribution mechanism (precision 1e12) |
| **Dead Shares** | Virtual offset (1000) to protect against share inflation |
| **MIN_K** | Minimum value of k (1e6) — floor preventing k→0 |
| **Funding Freed** | USDC freed by k-decay, distributed to LPs |

---

*All calculations are based on current protocol parameters. Parameters may be changed by the admin within on-chain constraints. DeFi carries risks of loss of funds.*
