# Holging 策略 — 完整指南

> **Holging = Hold + Hedge。** 50% SOL + 50% shortSOL = 任何价格波动均可获利。

---

## 1. 什么是 Holging

Holging 是一种 delta 中性策略，投资组合由两个等额部分组成：

```
Портфель = 50% SOL + 50% shortSOL
```

由于乘法定价模型（`shortSOL = k / SOL`），该投资组合在 SOL 任何非零方向的波动中都**从数学上保证**盈利。

### 盈亏公式

```
P&L = (x − 1)² / (2x)    где x = SOL_new / SOL_entry
```

这源于 AM-GM 不等式：对于任意 x > 0，`(x + 1/x) / 2 ≥ 1`。

**8 条定理已在 Lean 4 (Mathlib) 中形式化证明。**

---

## 2. 盈利表

| SOL 变动 | 毛盈亏 | 净盈亏（−0.08% 手续费） | 基于 $10,000 |
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

### 盈亏平衡点

- SOL 必须波动 **±4%** 才能覆盖 0.08% 的往返手续费
- 当波动 < ±4% 时，策略将产生等于手续费金额的亏损（$10K 上为 $8）
- 在 SOL 年化波动率约 60% 的情况下，几乎每天都能突破该阈值

---

## 3. 是否需要再平衡？

**是的。** 再平衡是最大化 Holging 盈利的关键。

### 为什么要再平衡

在 SOL 发生波动后，投资组合的比例会偏移：

```
Старт:     50% SOL ($5,000) + 50% shortSOL ($5,000)
SOL +20%:  54.5% SOL ($6,000) + 45.5% shortSOL ($5,000)
                                 ↑ портфель стал 55/45, уже не delta-neutral
```

再平衡将投资组合恢复至 50/50：
1. 卖出部分 SOL 换取 USDC
2. 用 USDC 购买 shortSOL
3. 从新价格点恢复 50/50

### 再平衡成本

```
Ребалансировка = Redeem shortSOL → USDC → Mint shortSOL
Комиссия: 0.08% roundtrip × размер ребалансировки
Максимум: 0.16% от портфеля (при полной перебалансировке обоих ног)
```

### 最优阈值

| 阈值 | 收益/手续费比 | 建议 |
|-------|---------------|--------------|
| ±3% | 0.3x | ❌ 亏损 — 手续费吞噬全部收益 |
| ±5% | 0.7x | ❌ 仍然亏损 |
| ±10% | 2.8x | ⚠️ 边际收益 |
| ±15% | 6.1x | ✅ 良好 |
| **±20%** | **10.4x** | **✅ 最优** |
| ±25% | 15.6x | ✅ 保守 |
| ±30% | 21.6x | ✅ 适用于大仓位 |

**建议：当 SOL 从入场价波动 ±20% 时进行再平衡。**

在此阈值下：
- 收益/手续费比 = 10x（手续费仅占利润的 10%）
- 在当前 SOL 波动率下每年约进行 6 次再平衡
- 每次再平衡锁定约 1.5% 的利润

---

## 4. 数据来源

### SOL 价格 — Pyth Network

```
Feed ID: ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
Latency: ~400ms
Тип: Pull-based (on-demand)
```

通过 MCP Server：
```
→ get_price { "pool_id": "sol" }
← { "SOL_USD": 84.37, "shortSOL_USD": 85.31, "confidence": 0.04 }
```

### 钱包持仓

```
→ get_position { "pool_id": "sol" }
← {
    "solBalance": "100.0000 SOL",
    "usdcBalance": "$5,000.00",
    "inverseTokenBalance": "58.5000 shortSOL",
    "inverseTokenValueUsd": "$5,000.00"
  }
```

### 池子状态

```
→ get_pool_state { "pool_id": "sol" }
← {
    "coverageRatio": "6433%",
    "dynamicFee": "0.04%",
    "paused": false
  }
```

---

## 5. 如何对冲收益风险

### Holging 策略风险

| 风险 | 描述 | 对冲方式 |
|------|-------------|-------|
| **低波动率** | SOL 波动 < ±4%，手续费 > 盈亏 | 选择高波动率时段 |
| **资金费率** | k 衰减 10 bps/天 会降低 shortSOL | 再平衡重置入场价格 |
| **金库风险** | 覆盖率 < 95% 时触发熔断机制 | 监控 `get_pool_state` → coverage |
| **预言机风险** | Pyth 数据过期 / 操纵 | 合约内 4 级验证 |
| **Gas 成本** | 交易所需 SOL | 极低（devnet 上 < $0.01） |

### 收益对冲策略

**第 1 步：入场过滤 — 仅在隐含波动率较高时入场**

```python
# Псевдокод: проверяем 7-дневную историческую волатильность
if sol_7d_volatility > 40%:
    enter_holging()   # Высокая vol = больше P&L
else:
    wait()            # Низкая vol = комиссии > gain
```

**第 2 步：复利再平衡**

每次再平衡：
1. 锁定利润
2. 将 delta 归零（重新回到 delta 中性）
3. 重置入场价格
4. 更新资金费率基线

```
Месяц 1:  SOL +15%  → ребалансировка → +0.82% зафиксировано
Месяц 2:  SOL −12%  → ребалансировка → +0.65% зафиксировано
Месяц 3:  SOL +8%   → ожидание (< порога ±20%)
Месяц 4:  SOL +22%  → ребалансировка → +1.51% зафиксировано
                                         Итого: +2.98% за 4 месяца
```

**第 3 步：利润提取**

每次再平衡后，可以提取部分利润：

```
Прибыль за ребалансировку: $150 (1.5% на $10K)
  → 80% реинвестировать ($120)
  → 20% вывести в стейблкоины ($30)
```

---

## 6. 何时重新入场

### 场景 1：资金费率消耗仓位

```
k-decay: 10 bps/day = ~3% за месяц
```

如果 SOL 一个月内保持横盘 → shortSOL 将因资金费率损失约 3%。

**规则：** 如果 2 周内未进行再平衡（SOL 在 ±20% 范围内），则退出并等待。

### 场景 2：熔断机制触发

```
→ get_pool_state
← { "paused": true, "coverageRatio": "94%" }
```

池子已暂停。**操作：** 等待管理员恢复，不要恐慌 — 资金在金库中受到保护。

### 场景 3：理想的重新入场

```
1. Выйти из позиции (redeem shortSOL → USDC)
2. Подождать низкой волатильности (накопление)
3. Войти снова когда vol возрастает (breakout)
```

### 重新入场指标

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

## 7. 通过 MCP 实现自动化

### 完整自动化周期

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

### MCP 工作流：初始入场

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

### MCP 工作流：再平衡检查（每小时）

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

### MCP 工作流：退出

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

### 机器人配置示例

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

## 8. 总结

| 参数 | 值 |
|-----------|-------|
| **策略** | 50% SOL + 50% shortSOL |
| **数学保证** | 对于任意 x ≠ 1，P&L ≥ 0（AM-GM） |
| **盈亏平衡点** | SOL ±4% |
| **最优再平衡阈值** | ±20% |
| **预期再平衡次数** | 约 6 次/年 |
| **再平衡成本** | 投资组合的 0.16% |
| **资金费率衰减** | 约 3%/月（10 bps/天） |
| **推荐持有期** | 1–6 个月（配合再平衡） |
| **自动化** | MCP Server，11 个工具 |
| **监控** | 每小时执行 get_price + get_position |

### 盈利公式

```
Annual Return ≈ Σ (holging_gain_i − rebalance_fee_i) − funding_decay

Где:
  holging_gain_i = (x_i − 1)² / (2x_i)    за каждый период между ребалансировками
  rebalance_fee = 0.16%                      за каждую ребалансировку
  funding_decay = 10 bps/day                 между ребалансировками
```

---

## 链接

- [shortSOL 代币规范](./SHORTSOL.md)
- [数学证明（Lean 4）](https://github.com/holging/holging/tree/main/lean-proofs)
- [MCP Server](https://github.com/holging/holging/tree/main/mcp-server)
- [在线应用](https://holging.com)

---

*Holging — 任何方向均可获利。通过 MCP 实现自动化。*
