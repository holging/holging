# Holging Strategy — Complete Guide

> **Holging = Hold + Hedge.** 50% SOL + 50% shortSOL = profit on any price movement.

---

## 1. What is Holging

Holging is a delta-neutral strategy where the portfolio consists of two equal parts:

```
Портфель = 50% SOL + 50% shortSOL
```

Thanks to the multiplicative pricing model (`shortSOL = k / SOL`), the portfolio is **mathematically guaranteed** to be profitable on any non-zero SOL movement in either direction.

### P&L Formula

```
P&L = (x − 1)² / (2x)    где x = SOL_new / SOL_entry
```

This follows from the AM-GM inequality: `(x + 1/x) / 2 ≥ 1` for any x > 0.

**8 theorems formally proven in Lean 4 (Mathlib).**

---

## 2. Profitability Table

| SOL движение | Gross P&L | Net P&L (−0.08% fee) | На $10,000 |
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
Старт:     50% SOL ($5,000) + 50% shortSOL ($5,000)
SOL +20%:  54.5% SOL ($6,000) + 45.5% shortSOL ($5,000)
                                 ↑ портфель стал 55/45, уже не delta-neutral
```

Rebalancing returns the portfolio to 50/50:
1. Sell some SOL for USDC
2. Buy shortSOL with USDC
3. Back to 50/50 from the new price

### Cost of Rebalancing

```
Ребалансировка = Redeem shortSOL → USDC → Mint shortSOL
Комиссия: 0.08% roundtrip × размер ребалансировки
Максимум: 0.16% от портфеля (при полной перебалансировке обоих ног)
```

### Optimal Threshold

| Порог | Gain/Fee ratio | Рекомендация |
|-------|---------------|--------------|
| ±3% | 0.3x | ❌ Убыточно — комиссия съедает весь gain |
| ±5% | 0.7x | ❌ Ещё убыточно |
| ±10% | 2.8x | ⚠️ Маргинально |
| ±15% | 6.1x | ✅ Хорошо |
| **±20%** | **10.4x** | **✅ Оптимально** |
| ±25% | 15.6x | ✅ Консервативно |
| ±30% | 21.6x | ✅ Для крупных позиций |

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
Тип: Pull-based (on-demand)
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
# Псевдокод: проверяем 7-дневную историческую волатильность
if sol_7d_volatility > 40%:
    enter_holging()   # Высокая vol = больше P&L
else:
    wait()            # Низкая vol = комиссии > gain
```

**Step 2: Compound rebalancing**

Each rebalance:
1. Locks in profit
2. Zeroes out delta (delta-neutral again)
3. Resets the entry point
4. Updates funding baseline

```
Месяц 1:  SOL +15%  → ребалансировка → +0.82% зафиксировано
Месяц 2:  SOL −12%  → ребалансировка → +0.65% зафиксировано
Месяц 3:  SOL +8%   → ожидание (< порога ±20%)
Месяц 4:  SOL +22%  → ребалансировка → +1.51% зафиксировано
                                         Итого: +2.98% за 4 месяца
```

**Step 3: Profit extraction**

After each rebalance, part of the profit can be withdrawn:

```
Прибыль за ребалансировку: $150 (1.5% на $10K)
  → 80% реинвестировать ($120)
  → 20% вывести в стейблкоины ($30)
```

---

## 6. When to Re-enter

### Scenario 1: Funding rate eats the position

```
k-decay: 10 bps/day = ~3% за месяц
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
1. Выйти из позиции (redeem shortSOL → USDC)
2. Подождать низкой волатильности (накопление)
3. Войти снова когда vol возрастает (breakout)
```

### Re-entry Indicator

```
Entry signal:
  - SOL 7-day realized vol > 50% annualized
  - Pool coverage > 200%
  - Dynamic fee = base (0.04%)

Exit signal:
  - SOL 14-day realized vol < 25%
  - Или funding decay > unrealized holging P&L
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
# Шаг 1: Проверяем рынок
→ get_price { "pool_id": "sol" }
← SOL = $84.00, shortSOL = $85.71

# Шаг 2: Проверяем vault health
→ get_pool_state { "pool_id": "sol" }
← coverage = 6433%, fee = 0.04%, paused = false ✅

# Шаг 3: Рассчитываем позицию
#   $10,000 портфель: $5,000 SOL + $5,000 shortSOL
#   Нужно: 5000 / 85.71 = 58.33 shortSOL

# Шаг 4: Превью
→ simulate_mint { "usdc_amount": 5000 }
← expected: 58.33 shortSOL, fee: $2.00

# Шаг 5: Исполнение
→ mint { "usdc_amount": 5000 }
← ✅ signature: "3tAM59..."

# Шаг 6: Верификация
→ get_position { "pool_id": "sol" }
← shortSOL: 58.33, value: $5,000
```

### MCP Workflow: Rebalance Check (every hour)

```
# Шаг 1: Текущая цена
→ get_price { "pool_id": "sol" }
← SOL = $100.80 (+20% от входа $84.00)

# Шаг 2: Рассчитываем текущий P&L
#   x = 100.80 / 84.00 = 1.20
#   P&L = (1.20 - 1)² / (2 × 1.20) = 1.67%
#   Порог: 20% → достигнут ✅ → РЕБАЛАНСИРОВКА

# Шаг 3: Текущая позиция
→ get_position
← shortSOL: 58.33, value: $4,167 (shortSOL подешевел)
   SOL: 59.52 SOL × $100.80 = $5,999

# Шаг 4: Нужно привести к 50/50
#   Total: $4,167 + $5,999 = $10,166
#   Target: $5,083 каждая нога
#   Нужно mint: ($5,083 - $4,167) / $71.43 per shortSOL = 12.82 shortSOL
#   → mint $916 USDC

# Шаг 5: Продать SOL, получить USDC (на DEX)
# Шаг 6: Mint shortSOL
→ simulate_mint { "usdc_amount": 916 }
→ mint { "usdc_amount": 916 }
← ✅ rebalanced

# Шаг 7: Зафиксировано: +$166 (1.67% на $10K)
```

### MCP Workflow: Exit

```
# Когда: vol низкая 14 дней, или funding decay > holging gain

# Шаг 1: Текущая позиция
→ get_position
← shortSOL: 58.33

# Шаг 2: Превью
→ simulate_redeem { "token_amount": 58.33 }
← expected: $4,985 USDC, fee: $2.00

# Шаг 3: Исполнение
→ redeem { "token_amount": 58.33 }
← ✅ $4,985 USDC получено

# Итого: вышли в $4,985 USDC + SOL позиция
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

Где:
  holging_gain_i = (x_i − 1)² / (2x_i)    за каждый период между ребалансировками
  rebalance_fee = 0.16%                      за каждую ребалансировку
  funding_decay = 10 bps/day                 между ребалансировками
```

---

## Links

- [shortSOL Token Spec](./SHORTSOL.md)
- [Math Proofs (Lean 4)](https://github.com/holging/holging/tree/main/lean-proofs)
- [MCP Server](https://github.com/holging/holging/tree/main/mcp-server)
- [Live App](https://holging.com)

---

*Holging — profit in any direction. Automate via MCP.*
