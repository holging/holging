# Holging Strategy — Complete Guide

> **Holging = Hold + Hedge.** 50% SOL + 50% shortSOL = profit on any price movement.

---

## 1. What is Holging

Holging is a delta-neutral strategy where the portfolio consists of two equal parts:

```
Portfolio = 50% SOL + 50% shortSOL
```

Thanks to the multiplicative pricing model (`shortSOL = k / SOL`), the portfolio is **mathematically guaranteed** to be profitable on any non-zero SOL movement in either direction.

### P&L Formula

```
P&L = (x − 1)² / (2x)    where x = SOL_new / SOL_entry
```

This follows from the AM-GM inequality: `(x + 1/x) / 2 ≥ 1` for any x > 0.

**8 theorems formally proven in Lean 4 (Mathlib).**

---

## 2. Profitability Table

| SOL movement | Gross P&L | Net P&L (−0.08% fee) | On $10,000 |
|-------------|-----------|----------------------|------------|
| −80% | +160.00% | +159.92% | +$15,992 |
| −50% | +25.00% | +24.92% | +$2,492 |
| −25% | +4.17% | +4.09% | +$409 |
| −10% | +0.56% | +0.48% | +$48 |
| −5% | +0.13% | +0.05% | +$5 |
| 0% | 0.00% | −0.08% | −$8 |
| +5% | +0.12% | +0.04% | +$4 |
| +10% | +0.45% | +0.37% | +$37 |
| +25% | +2.50% | +2.42% | +$242 |
| +50% | +8.33% | +8.25% | +$825 |
| +100% | +25.00% | +24.92% | +$2,492 |
| +200% | +66.67% | +66.59% | +$6,659 |

### Break-even

- SOL must move by **±4%** to cover the 0.08% roundtrip fee
- With movement < ±4% the strategy is at a loss equal to the fee amount ($8 on $10K)
- With SOL volatility ~60% annualized, the threshold is crossed practically every day

---

## 3. Is Rebalancing Needed?

**Yes.** Rebalancing is the key to maximizing Holging profitability.

### Why Rebalance

After a SOL movement, the portfolio proportions shift:

```
Start:     50% SOL ($5,000) + 50% shortSOL ($5,000)
SOL +20%:  54.5% SOL ($6,000) + 45.5% shortSOL ($5,000)
                                 ↑ portfolio became 55/45, no longer delta-neutral
```

Rebalancing returns the portfolio to 50/50:
1. Sell some SOL for USDC
2. Buy shortSOL with USDC
3. Back to 50/50 from the new price

### Cost of Rebalancing

```
Rebalancing = Redeem shortSOL → USDC → Mint shortSOL
Fee: 0.08% roundtrip × rebalancing size
Maximum: 0.16% of portfolio (for full rebalancing of both legs)
```

### Optimal Threshold

| Threshold | Gain/Fee ratio | Recommendation |
|-------|---------------|--------------|
| ±3% | 0.3x | ❌ Unprofitable — fee eats all gain |
| ±5% | 0.7x | ❌ Still unprofitable |
| ±10% | 2.8x | ⚠️ Marginal |
| ±15% | 6.1x | ✅ Good |
| **±20%** | **10.4x** | **✅ Optimal** |
| ±25% | 15.6x | ✅ Conservative |
| ±30% | 21.6x | ✅ For large positions |

**Recommendation: rebalance when SOL moves ±20% from the entry point.**

At this threshold:
- Gain/fee ratio = 10x (fee = 10% of profit)
- ~6 rebalances per year at current SOL volatility
- Each rebalance locks in ~1.5% profit

---

## 4. Where We Get Data

### SOL Price — Pyth Network

```
Feed ID: ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
Latency: ~400ms
Type: Pull-based (on-demand)
```

Via MCP Server:
```
→ get_price { "pool_id": "sol" }
← { "SOL_USD": 84.37, "shortSOL_USD": 85.31, "confidence": 0.04 }
```

### Wallet Position

```
→ get_position { "pool_id": "sol" }
← {
    "solBalance": "100.0000 SOL",
    "usdcBalance": "$5,000.00",
    "inverseTokenBalance": "58.5000 shortSOL",
    "inverseTokenValueUsd": "$5,000.00"
  }
```

### Pool State

```
→ get_pool_state { "pool_id": "sol" }
← {
    "coverageRatio": "6433%",
    "dynamicFee": "0.04%",
    "paused": false
  }
```

---

## 5. How to Hedge the Yield

### Holging Strategy Risks

| Risk | Description | Hedge |
|------|-------------|-------|
| **Low volatility** | SOL moves < ±4%, fees > P&L | Choose a high-volatility period |
| **Funding rate** | k-decay 10 bps/day reduces shortSOL | Rebalancing resets entry price |
| **Vault risk** | Circuit breaker at coverage < 95% | Monitor `get_pool_state` → coverage |
| **Oracle risk** | Pyth staleness / manipulation | 4-level validation in the contract |
| **Gas costs** | SOL for transactions | Minimal (< $0.01 on devnet) |

### Yield Hedging Strategy

**Step 1: Entry filter — enter only during high implied vol**

```python
# Pseudocode: check 7-day historical volatility
if sol_7d_volatility > 40%:
    enter_holging()   # High vol = more P&L
else:
    wait()            # Low vol = fees > gain
```

**Step 2: Compound rebalancing**

Each rebalance:
1. Locks in profit
2. Zeroes out delta (delta-neutral again)
3. Resets the entry point
4. Updates funding baseline

```
Month 1:  SOL +15%  → rebalance → +0.82% locked in
Month 2:  SOL −12%  → rebalance → +0.65% locked in
Month 3:  SOL +8%   → wait (< ±20% threshold)
Month 4:  SOL +22%  → rebalance → +1.51% locked in
                                    Total: +2.98% over 4 months
```

**Step 3: Profit extraction**

After each rebalance, part of the profit can be withdrawn:

```
Profit per rebalance: $150 (1.5% on $10K)
  → 80% reinvest ($120)
  → 20% withdraw to stablecoins ($30)
```

---

## 6. When to Re-enter

### Scenario 1: Funding rate eats the position

```
k-decay: 10 bps/day = ~3% per month
```

If SOL stays flat for a month → shortSOL will lose ~3% from funding.

**Rule:** if there has been no rebalance for 2 weeks (SOL within ±20% range), exit and wait.

### Scenario 2: Circuit breaker triggered

```
→ get_pool_state
← { "paused": true, "coverageRatio": "94%" }
```

Pool is paused. **Action:** wait for admin to unpause, don't panic — funds are protected in the vault.

### Scenario 3: Ideal re-entry

```
1. Exit position (redeem shortSOL → USDC)
2. Wait for low volatility (accumulation)
3. Re-enter when vol increases (breakout)
```

### Re-entry Indicator

```
Entry signal:
  - SOL 7-day realized vol > 50% annualized
  - Pool coverage > 200%
  - Dynamic fee = base (0.04%)

Exit signal:
  - SOL 14-day realized vol < 25%
  - Or funding decay > unrealized holging P&L
```

---

## 7. Automation via MCP

### Full Automated Cycle

```
┌──────────────────────────────────────────┐
│           AI Agent Holging Bot           │
├──────────────────────────────────────────┤
│                                          │
│  1. SCAN     → get_all_prices            │
│  2. CHECK    → get_pool_state            │
│  3. EVALUATE → compare entry vs current  │
│  4. DECIDE   → rebalance? exit? wait?    │
│  5. SIMULATE → simulate_mint/redeem      │
│  6. EXECUTE  → mint / redeem             │
│  7. VERIFY   → get_position              │
│  8. LOG      → record trade              │
│                                          │
│  Repeat every 1 hour                     │
└──────────────────────────────────────────┘
```

### MCP Workflow: Initial Entry

```
# Step 1: Check market
→ get_price { "pool_id": "sol" }
← SOL = $84.00, shortSOL = $85.71

# Step 2: Check vault health
→ get_pool_state { "pool_id": "sol" }
← coverage = 6433%, fee = 0.04%, paused = false ✅

# Step 3: Calculate position
#   $10,000 portfolio: $5,000 SOL + $5,000 shortSOL
#   Need: 5000 / 85.71 = 58.33 shortSOL

# Step 4: Preview
→ simulate_mint { "usdc_amount": 5000 }
← expected: 58.33 shortSOL, fee: $2.00

# Step 5: Execute
→ mint { "usdc_amount": 5000 }
← ✅ signature: "3tAM59..."

# Step 6: Verify
→ get_position { "pool_id": "sol" }
← shortSOL: 58.33, value: $5,000
```

### MCP Workflow: Rebalance Check (every hour)

```
# Step 1: Current price
→ get_price { "pool_id": "sol" }
← SOL = $100.80 (+20% from entry $84.00)

# Step 2: Calculate current P&L
#   x = 100.80 / 84.00 = 1.20
#   P&L = (1.20 - 1)² / (2 × 1.20) = 1.67%
#   Threshold: 20% → reached ✅ → REBALANCE

# Step 3: Current position
→ get_position
← shortSOL: 58.33, value: $4,167 (shortSOL decreased in value)
   SOL: 59.52 SOL × $100.80 = $5,999

# Step 4: Need to bring to 50/50
#   Total: $4,167 + $5,999 = $10,166
#   Target: $5,083 each leg
#   Need to mint: ($5,083 - $4,167) / $71.43 per shortSOL = 12.82 shortSOL
#   → mint $916 USDC

# Step 5: Sell SOL, receive USDC (on DEX)
# Step 6: Mint shortSOL
→ simulate_mint { "usdc_amount": 916 }
→ mint { "usdc_amount": 916 }
← ✅ rebalanced

# Step 7: Locked in: +$166 (1.67% on $10K)
```

### MCP Workflow: Exit

```
# When: vol low for 14 days, or funding decay > holging gain

# Step 1: Current position
→ get_position
← shortSOL: 58.33

# Step 2: Preview
→ simulate_redeem { "token_amount": 58.33 }
← expected: $4,985 USDC, fee: $2.00

# Step 3: Execute
→ redeem { "token_amount": 58.33 }
← ✅ $4,985 USDC received

# Total: exited to $4,985 USDC + SOL position
```

### Example Bot Configuration

```json
{
  "strategy": "holging",
  "pool_id": "sol",
  "capital_usdc": 10000,
  "allocation": { "sol": 0.50, "shortSOL": 0.50 },
  "rebalance": {
    "threshold_pct": 20,
    "check_interval_minutes": 60,
    "min_gain_to_fee_ratio": 10
  },
  "entry": {
    "min_7d_vol_annualized": 40,
    "min_coverage_pct": 200,
    "max_dynamic_fee_bps": 10
  },
  "exit": {
    "max_days_without_rebalance": 14,
    "max_funding_loss_pct": 2
  },
  "risk": {
    "max_position_usd": 50000,
    "stop_if_paused": true,
    "stop_if_coverage_below": 150
  }
}
```

---

## 8. Summary

| Parameter | Value |
|-----------|-------|
| **Strategy** | 50% SOL + 50% shortSOL |
| **Mathematical guarantee** | P&L ≥ 0 for any x ≠ 1 (AM-GM) |
| **Break-even** | SOL ±4% |
| **Optimal rebalance threshold** | ±20% |
| **Expected rebalances** | ~6/year |
| **Rebalance cost** | 0.16% of portfolio |
| **Funding decay** | ~3%/month (10 bps/day) |
| **Recommended horizon** | 1–6 months (with rebalancing) |
| **Automation** | MCP Server, 11 tools |
| **Monitoring** | get_price + get_position every hour |

### Profitability Formula

```
Annual Return ≈ Σ (holging_gain_i − rebalance_fee_i) − funding_decay

Where:
  holging_gain_i = (x_i − 1)² / (2x_i)    for each period between rebalances
  rebalance_fee = 0.16%                      per rebalance
  funding_decay = 10 bps/day                 between rebalances
```

---

## Links

- [shortSOL Token Spec](./SHORTSOL.md)
- [Math Proofs (Lean 4)](https://github.com/holging/holging/tree/main/lean-proofs)
- [MCP Server](https://github.com/holging/holging/tree/main/mcp-server)
- [Live App](https://holging.com)

---

*Holging — profit in any direction. Automate via MCP.*
