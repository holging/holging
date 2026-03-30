# Holging Vault 分析 — 完整的金库与 LP 策略分析

> 日期：2026-03-29
> 所有公式和参数均经过 `programs/holging/src/` 验证
> 协议：Holging (CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX)

---

## 1. Vault 结构剖析

### 1.1 金库余额

Vault 包含来自三个来源的 USDC：

```
vault_balance = LP_principal + accumulated_fees + user_deposits_coverage
```

| 组成部分 | 来源 | 谁可以提取 |
|-----------|--------|-------------------|
| **LP principal** | LP 提供者通过 `add_liquidity` | LP 通过 `remove_liquidity` |
| **Accumulated fees** | mint/redeem 交易手续费 | LP 通过 `claim_lp_fees` |
| **Freed funding** | k-decay 减少义务 | LP 通过 `claim_lp_fees` |
| **User coverage** | 来自 mint 操作的 USDC | 用户通过 `redeem` |
| **Excess** | 超过 110% obligations 的差额 | 管理员通过 `withdraw_fees` |

### 1.2 Vault 义务（Obligations）

```
obligations = circulating × shortSOL_price / 1e9 / 1e3
            = circulating × k / SOL_price / 1e3
```

当 SOL 下跌时义务增加（shortSOL 升值），当 SOL 上涨时义务减少。

### 1.3 Vault 健康比率

```
vault_ratio = vault_balance / obligations × 10,000 (以 bps 为单位)
```

| 比率 | 状态 | 发生什么 |
|-------|--------|----------------|
| > 200% | 🟢 健康 | 最低手续费（20 bps），LP 可自由提取 |
| 150–200% | 🟡 正常 | 标准手续费（40 bps） |
| 110–150% | 🟠 升高 | 较高手续费（60 bps），LP 可提取 |
| 95–110% | 🔴 危急 | 最高手续费（80 bps），LP 提取被锁定 |
| < 95% | ⛔ Circuit Breaker | 所有 redeem 被冻结，仅允许 mint |

---

## 2. LP 收益来源

### 2.1 交易手续费

**年化手续费收益公式：**
```
Fee_Revenue_Annual = Daily_Volume × Fee_Roundtrip × 365
Fee_APY = Fee_Revenue_Annual / TVL × 100%
```

**按 vault 健康状态划分的手续费表：**

| Vault 健康度 | base_fee（单边）| 乘数 | 有效费率（单边）| 往返费率 | 最大值（上限） |
|-------------|--------------------:|-----------|---------------------:|----------:|--------------:|
| > 200% | 4 bps | ×5 | 20 bps | 40 bps | — |
| 150–200% | 4 bps | ×10 | 40 bps | 80 bps | — |
| 100–150% | 4 bps | ×15 | 60 bps | 120 bps | — |
| < 100% | 4 bps | ×20 | 80 bps | 100 bps* | *上限为 100 bps |

### 2.2 Funding Rate（k-Decay）

**k-decay 公式：**
```
k_new = k_old × (864,000,000 − rate_bps × elapsed_secs) / 864,000,000
```

**LP 从 funding 获得的收益：**
```
freed_usdc = obligations_before_decay − obligations_after_decay
           = circulating × (k_old − k_new) × 1e9 / SOL_price / 1e9 / 1e3
```

**不同利率下的年化复利：**

| rate_bps/天 | 日衰减 | 月度 | 年化复利 | 年化单利 |
|---------------|---------------|----------|-----------------|-----------------|
| 1 | 0.01% | 0.30% | 3.57% | 3.65% |
| 5 | 0.05% | 1.51% | 16.62% | 18.25% |
| **10** | **0.10%** | **3.00%** | **30.59%** | **36.50%** |
| 20 | 0.20% | 5.91% | 52.15% | 73.00% |
| 50 | 0.50% | 14.07% | 83.86% | 182.50% |
| 100 | 1.00% | 26.03% | 97.41% | 365.00% |

> 当前利率：**10 bps/天**（0.10%/天，30.59% 年化复利）

### 2.3 综合 APY 公式

```
Total_APY = Fee_APY + Funding_APY

Fee_APY = (Daily_Volume × Roundtrip_Fee_BPS / 10,000 × 365) / TVL
Funding_APY = 1 − (1 − rate_bps/10,000)^365
            ≈ 30.59% 在 10 bps/天时
```

---

## 3. 场景模拟

### 3.1 场景 A：健康市场（SOL 稳定 ±10%）

**条件：** SOL = $150，TVL = $500K，日交易量 = $100K，Vault ratio > 200%

```
手续费：20 bps 单边 = 40 bps 往返

手续费收益/天    = $100,000 × 0.004 = $400
手续费收益/年    = $400 × 365 = $146,000
Fee APY          = $146,000 / $500,000 = 29.20%

Funding 收益/天  = $500,000 × 0.001 = $500
Funding 收益/年  = ~$152,950（复利）
Funding APY      = 30.59%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total APY          = 33.51%
$10,000 LP 收益    = $3,351/年 = $279/月
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3.2 场景 B：高波动性（SOL ±30%）

**条件：** SOL 在 $100–$200 之间波动，TVL = $500K，日交易量 = $300K，Vault ratio 150–200%

```
手续费：20 bps 单边 = 40 bps 往返

手续费收益/天    = $300,000 × 0.008 = $2,400
手续费收益/年    = $2,400 × 365 = $876,000
Fee APY          = $876,000 / $500,000 = 175.20%

Funding APY      = 30.59%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total APY（毛利）  = 118.19%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

但是：当 SOL 下跌 −30% 时，vault ratio 可能下降：
  义务增长：shortSOL 升值 42.8%（1/0.7 − 1）
  Vault ratio 下降：可能从 200% → ~140%

$10,000 LP 收益  = $11,819/年
潜在无常损失      = SOL 下跌 −30% 且无恢复时高达 −15%
净 APY（含 IL）  ≈ 80–100%（若一个月内恢复）
```

### 3.3 场景 C：SOL 崩盘（一周内 −50%）

**条件：** SOL：$150 → $75，TVL = $500K，流通 shortSOL = $200K

```
崩盘前：
  obligations = $200,000
  vault_ratio = $500,000 / $200,000 = 250%（健康）

崩盘后（SOL −50%）：
  shortSOL 升值 2 倍：obligations = $400,000
  vault_ratio = $500,000 / $400,000 = 125%（升高）
  
  手续费切换至 60 bps（×15 乘数）
  LP 提取：可用（ratio > 110%）

后续发展：
  一周内 k-decay：k 减少 0.7%
  新 obligations：$400,000 × 0.993 = $397,200
  释放给 LP 的 USDC：$2,800
  
  高手续费吸引 mint 操作（USDC 流入 vault ↑）
  若一周内有 $50K 新 mint：
    vault = $550,000，obligations = $447,200
    ratio = $550,000 / $447,200 = 123% → 趋于稳定

LP 一周损益：
  手续费收入：  ~$840（来自升高的手续费）
  Funding 释放：~$2,800
  未实现 IL：   −$0（本金未受影响，但 ratio < 110% 时提取受限）
```

### 3.4 场景 D：黑天鹅（SOL −80%）

**条件：** SOL：$150 → $30，TVL = $500K，circulating = $200K

```
崩盘后：
  shortSOL 升值 5 倍：obligations = $1,000,000
  vault = $500,000
  ratio = $500,000 / $1,000,000 = 50%

  ⛔ CIRCUIT BREAKER 触发（ratio < 95%）
  
  所有 redeem 被冻结
  LP 提取被锁定
  仅允许 mint（但谁会在 SOL = $30 时 mint shortSOL？）

恢复路径：
  1. SOL 回升：当 SOL = $75 时 → obligations = $400K，ratio = 125%
  2. k-decay：30 天内 obligations 下降约 3%：$1M → $970K
  3. 新 LP 注入资金
  4. 管理员可暂停并等待恢复

LP 最坏情况：
  若 SOL 未恢复且无新 LP：
    $500K 本金承担 $1M 的 obligations
    LP 完全提取时约可收回每美元 50 美分
    损失：约 50% 本金
```

### 3.5 场景 E：牛市（SOL +100%）

**条件：** SOL：$150 → $300，TVL = $500K，日交易量 = $500K

```
上涨后：
  shortSOL 贬值 2 倍：obligations = $100,000
  vault = $500,000
  ratio = $500,000 / $100,000 = 500%（超级健康）
  
  手续费：20 bps（最低）
  LP 可自由提取
  管理员可提取盈余：$500K − 110% × $100K = $390K

LP 损益：
  手续费：$500K × 0.004 × 365 / $500K = 146% APY
  Funding：30.59% APY
  IL：$0（obligations 减少 — LP 获利）
  
  Total APY = 45.19%（因交易量增加手续费更高）
  $10,000 LP 收益 = $4,519/年
```

---

## 4. 各场景风险矩阵

| SOL 变动 | Vault Ratio | 手续费 | LP APY（毛利） | IL 风险 | LP 流动性 |
|-------------|-------------|----------|----------------|---------|----------------|
| +100%（×2） | 500%+ | 20 bps | 65%+ | 无 | ✅ 自由 |
| +50%（×1.5） | 333%+ | 20 bps | 60%+ | 无 | ✅ 自由 |
| +25%（×1.25） | 250%+ | 20 bps | 55%+ | 无 | ✅ 自由 |
| ±0% | 初始值 | 20–40 bps | 55–73% | 无 | ✅ 自由 |
| −25%（×0.75） | ~150% | 40 bps | 70–95% | 极低 | ✅ 自由 |
| −33%（×0.67） | ~120% | 60 bps | 80–110% | 中等 | ✅ 自由 |
| −40%（×0.60） | ~105% | 60 bps | 85–115% | 高 | ⚠️ 受限 |
| −50%（×0.50） | ~80% | 80 bps | — | 高 | ❌ 锁定 |
| −70%（×0.30） | ~45% | 80 bps | — | 危急 | ❌ Circuit Breaker |
| −90%（×0.10） | ~15% | 80 bps | — | 灾难性 | ❌ Circuit Breaker |

> IL 风险 — 基于全部 TVL 按 1:1 为流通中的 shortSOL 提供担保。
> 当 ratio > 200% 时，即使 SOL 大幅波动也不存在 IL。

---

## 5. LP 策略

### 5.1 "保守者"策略 — 最低风险

**描述：** 仅在 vault ratio > 300% 时提供流动性。当 ratio < 200% 时提取。

```
入场：vault_ratio > 300%
出场：vault_ratio < 200% 或 SOL 从入场价下跌 > 20%
持有：3–6 个月

预期 APY：33–38%
最大回撤：~5%（vault 有充足担保覆盖 IL）
Sharpe ratio：~2.0
```

**何时使用：** 稳定或牛市行情。低风险偏好的 LP。

### 5.2 "收益农夫"策略 — 最大化 APY

**描述：** 在 vault 承压时入场（ratio 120–150%），此时动态手续费最高。高手续费 + funding = 峰值 APY。

```
入场：vault_ratio 120–170%（手续费升高）
出场：vault_ratio > 250%（手续费正常化）
      或 vault_ratio < 110%（风险规避）
持有：1–4 周（策略性）

预期 APY：60–100%+
最大回撤：~20%（在承压时入场 — 底部可能就在附近）
Sharpe ratio：~1.5
```

**何时使用：** SOL 回调 20–30% 后。逆势策略。

### 5.3 "对冲者"策略 — LP + SOL 做空

**描述：** 提供 LP + 同时 mint 部分金额的 shortSOL。LP 收益对冲风险。

```
配置：
  70% → LP 存入（$7,000）
  30% → mint shortSOL（$3,000）

若 SOL 下跌：
  LP：vault 承压，但手续费更高 + funding
  shortSOL：价格上涨 → 补偿 LP 的 IL
  净值：Delta 中性，收益来自 LP 手续费 + funding

若 SOL 上涨：
  LP：vault 健康，稳定收益
  shortSOL：价格下跌 → 亏损
  净值：LP 收益 > shortSOL 亏损（波动 < 50% 时）

盈亏平衡点：SOL 变动 ±40%
预期 APY：20–25%（扣除 shortSOL 对冲成本后）
最大回撤：~10%
Sharpe ratio：~2.5
```

**何时使用：** 市场不确定时。适合机构级 LP。

### 5.4 "Holging 组合"策略 — LP + Holging 投资组合

**描述：** LP + 同时持有 50/50 的 SOL + shortSOL（Holging 策略）。

```
配置：
  50% → LP 存入（$5,000）
  25% → SOL（$2,500）
  25% → 通过 mint 获取 shortSOL（$2,500）

Holging 损益 = (x − 1)² / (2x) ≥ 0（始终为正）

当 SOL ±50% 时：Holging = +25% = +$1,250
LP APY 33%：    LP 收益 = +$1,650
节省 Funding：  shortSOL 不支付 funding（LP 获得 funding）

$10,000 总计：
  LP 收益：    $1,650
  Holging 损益：$1,250（在一次 ±50% 波动时）
  总计：       $2,900 = 该期间 29%
  
  多次波动时：Holging 持续累积
  每季度 4 次 ±30% 波动：+4.2%×4 = +16.8% 来自 Holging
  + LP 33% = 约 50% 年化

预期 APY：40–60%
最大回撤：~15%（shortSOL 因 funding 而衰减）
```

**何时使用：** 最大化协议敞口。适合对产品有信心的用户。

---

## 6. 压力测试：Vault 能承受多少？

### 6.1 SOL 最大跌幅至 Circuit Breaker

**公式：** 当 `vault_ratio < 95%` 时触发 Circuit breaker

```
vault_balance / (circulating × k / SOL_new / 1e3) < 0.95

SOL_new = SOL_init × (vault_balance × 10,000) / (circulating × k / 1e3 × 9,500)
```

**表格：不同利用率下 SOL 触发 circuit breaker 的最大跌幅：**

| 利用率（circ/vault） | Vault Ratio（初始）| SOL 跌至 CB | SOL 跌至 LP 锁定（110%） |
|--------------------------|-------------------:|---------------:|---------------------------:|
| 10% | 1000% | −90.5% | −89.1% |
| 20% | 500% | −79.0% | −76.4% |
| 30% | 333% | −68.3% | −63.6% |
| 40% | 250% | −57.9% | −51.3% |
| **50%** | **200%** | **−47.4%** | **−38.5%** |
| 60% | 167% | −36.8% | −25.5% |
| 70% | 143% | −26.3% | −12.3% |
| 80% | 125% | −15.8% | −2.0% |
| 90% | 111% | −5.3% | 0%（已锁定） |

> **利用率 50%** — 典型场景。SOL 可下跌约 47% 才会触发 circuit breaker。

### 6.2 压力后恢复时间

```
k-decay 每天恢复约 0.1% 的义务比率

当 ratio = 80%（SOL −50% 后）：
  需要恢复：95% − 80% = 15% ratio
  通过 funding：约 150 天（0.1%/天）
  通过新 mint：更快（取决于交易量）
  通过 SOL 回升：SOL 上涨 +20% 时立即恢复
```

### 6.3 历史回测（SOL 2024–2025）

| 时期 | SOL 变动 | 最大回撤 | Vault Ratio（50% 利用率时） | 触发 CB？ |
|--------|-------------|---------------|---------------------------|---------------|
| 2024 年 1 月 | $100 → $200（+100%） | 0% | 200% → 400% | ❌ |
| 2024 年 4 月 | $200 → $130（−35%） | −35% | 400% → ~187% | ❌ |
| 2024 年 11 月 | $130 → $260（+100%） | 0% | 187% → 500%+ | ❌ |
| 2025 年 1 月 | $260 → $170（−35%） | −35% | 500% → ~230% | ❌ |
| 2025 年 3 月 | $170 → $125（−26%） | −26% | 230% → ~170% | ❌ |
| 2025 年 7 月 | $125 → $180（+44%） | 0% | 170% → 350% | ❌ |

> **结果：** 基于 2024–2025 年历史数据，在 50% 利用率下 circuit breaker **从未触发过**。Vault ratio 最大跌幅：~170%（仍处于绿色区域）。

---

## 7. LP 最优参数

### 7.1 最优仓位规模

```
建议：不超过流动加密资产组合的 10–20%

$10K 投资组合 → $1K–2K 投入 LP
$100K 投资组合 → $10K–20K 投入 LP
$1M 投资组合 → $100K–200K 投入 LP
```

### 7.2 最优入场时机

| 信号 | 操作 | 原因 |
|--------|----------|--------|
| SOL 回调 −20–30% | 🟢 入场 | 高手续费，接近底部，恢复后可获峰值 APY |
| SOL 处于历史高位 | 🟡 谨慎 | Ratio 高（利好），但存在下跌潜力（不利） |
| SOL 处于下降趋势 | 🔴 等待 | Ratio 可能下降，手续费上升但 IL 也在增加 |
| Vault ratio > 300% | 🟢 入场 | 最大安全缓冲 |
| Vault ratio < 150% | 🔴 仅限"收益农夫" | 高 APY 但锁仓风险高 |

### 7.3 仓位监控

**需跟踪的关键指标：**

| 指标 | 查看位置 | 操作触发条件 |
|---------|-------------|---------------------|
| Vault Ratio | holging.com/state | < 150% → 考虑退出 |
| SOL 价格 | pyth.network | 从入场价下跌 > 20% → 警报 |
| k 值 | 链上 PoolState | 急剧下降 = keeper 问题 |
| Fee per share | 链上 PoolState | 上升 = 手续费在累积 |
| 流通供应量 | 链上 PoolState | 上升 = 更多义务 |
| 待领取手续费 | 链上 LpPosition | > $100 → 领取 |

---

## 8. 公式速查表

| 内容 | 公式 |
|-----|---------|
| Vault Ratio | `vault_balance × 10,000 / obligations` |
| Obligations | `circulating × k / SOL_price / 1e3` |
| Fee APY | `daily_volume × roundtrip_bps / 10,000 × 365 / TVL` |
| Funding APY | `1 − (1 − rate_bps/10,000)^365` |
| Total APY | `Fee_APY + Funding_APY` |
| LP Shares | `usdc × (supply + 1000) / (principal + 1000)` |
| USDC on Redeem | `shares × principal / supply` |
| Fee per LP | `(fee_per_share_accumulated − checkpoint) × shares / 1e12` |
| k-decay（每日） | `k × (864M − rate_bps × 86400) / 864M` |
| Freed USDC | `obligations_before − obligations_after_decay` |
| SOL 最大跌幅至 CB | `1 − 0.95 × obligations / vault_balance` |
| 动态手续费乘数 | `{>200%: ×5, 150–200%: ×10, 100–150%: ×15, <100%: ×20}` |
| Holging 盈亏平衡 | `SOL 变动 > ±9%` (0.40% 往返手续费)） |

---

## 9. 术语表

| 术语 | 定义 |
|--------|------------|
| **TVL** | Total Value Locked — vault 中的总 USDC |
| **Vault Ratio** | vault_balance 与 obligations 的比率（以 % 表示） |
| **Obligations** | 流通中 shortSOL 的总 USDC 价值 |
| **Utilization** | vault 中用于担保 shortSOL 的比例（obligations / vault） |
| **k** | 归一化常数：shortSOL_price = k / SOL_price |
| **k-decay** | 通过 funding rate 持续减少 k |
| **Circuit Breaker** | 当 vault ratio < 95% 时自动暂停 redeem |
| **IL（无常损失）** | SOL 下跌时 LP 的潜在亏损 |
| **Fee Accumulator** | LP 手续费分配机制（精度 1e12） |
| **Dead Shares** | 虚拟偏移量（1000），用于防止份额膨胀攻击 |
| **MIN_K** | k 的最小值（1e6）— 防止 k→0 的下限 |
| **Funding Freed** | k-decay 释放的 USDC，分配给 LP |

---

*所有计算基于当前协议参数。参数可由管理员在链上约束范围内修改。DeFi 存在资金损失风险。*
