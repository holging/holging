# shortSOL — SOL 反向代币

> SOL 的反向敞口代币。当 SOL 下跌时，shortSOL 价格上涨。

---

## 概述

| 参数 | 值 |
|----------|----------|
| **全称** | shortSOL |
| **类型** | SPL Token (Solana) |
| **铸币地址** | `8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2` |
| **精度** | 9 |
| **冻结权限** | 无（不可冻结） |
| **铸币权限** | PDA `7gBZeefuxo4RcYAZitTzT414KFGvhUSC5XRtWy1sEB7q`（仅限程序） |
| **网络** | Solana Devnet |
| **协议** | Holging |
| **资金池 ID** | `sol` |

---

## 定价公式

```
shortSOL_price = k / SOL_price
```

| 参数 | 值 | 说明 |
|----------|----------|----------|
| **k** | 7,197,715,091,917 | 归一化常数，用于设定初始价格 |
| **精度** | 1e9 | 所有价格按 9 位小数缩放 |
| **P₀** | $84.84 | 资金池启动时的 SOL 初始价格 |
| **shortSOL₀** | $84.84 | shortSOL 初始价格 = P₀ |

### 运作方式

```
SOL = $100  →  shortSOL = 7197715091917 × 1e9 / (100 × 1e9) = $71.98
SOL = $50   →  shortSOL = 7197715091917 × 1e9 / (50 × 1e9)  = $143.95
SOL = $170  →  shortSOL = 7197715091917 × 1e9 / (170 × 1e9) = $42.34
```

- SOL 上涨 → shortSOL 下跌
- SOL 下跌 → shortSOL 上涨
- 两者之间的关系是**乘法关系**（1/x），而非加法关系（-x）
- **无波动率衰减** — 价格仅取决于当前 SOL 价格
- **无路径依赖** — 价格如何到达当前点位并不重要

---

## 当前状态

| 指标 | 值 |
|---------|----------|
| **SOL/USD** | $83.98 |
| **shortSOL/USD** | $85.71 |
| **流通量** | 20.3492 shortSOL |
| **总铸造量** | 935.7642 shortSOL |
| **总赎回量** | 915.4150 shortSOL |
| **金库余额** | $111,638.59 USDC |
| **已收手续费** | $57.56 |
| **状态** | ✅ 运行中 |

---

## 链上地址

| 账户 | 地址 | 说明 |
|---------|-------|----------|
| **程序** | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` | Holging 智能合约 |
| **资金池状态** | `BXWhFrt39ruEpaWANuzTnb4JtPAzfsVgE2Y1dqfBhSnh` | SOL 资金池的 PDA 账户 |
| **shortSOL 铸币地址** | `8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2` | SPL Token 铸币地址 |
| **铸币权限** | `7gBZeefuxo4RcYAZitTzT414KFGvhUSC5XRtWy1sEB7q` | PDA — 仅程序可铸造 |
| **USDC 金库** | `AQ3vTfWBHBY2gPdc5SSK7M33RN5waN6ByPKwMdhtnEr1` | USDC 存储 |
| **USDC 铸币地址** | `CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn` | Devnet USDC |
| **资金费率配置** | `9L2FBc5HU2t475n2gRroj3TKzENpikeghLiSsoHZHvDf` | 资金费率配置 |
| **LP 铸币地址** | `8oWELKc9GL3eYhC7YLbvvttNBKL6DskBB1GCiDSuKLNY` | 流动性提供者的 LP 代币 |
| **管理员** | `66HBrTxNii7eFzSTgo8mUzsij3FM7xC2L9jE2H89sDYs` | 管理员钱包 |

### Pyth 预言机

| 参数 | 值 |
|----------|----------|
| **数据源** | SOL/USD |
| **数据源 ID** | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| **延迟** | ~400ms（拉取模式） |
| **过期时限** | 259,200 秒（3 天，devnet）/ 30 秒（mainnet） |

---

## 操作

### 铸造（购买 shortSOL）

```
用户 → USDC → 协议 → shortSOL

示例：100 USDC → ~1.17 shortSOL（SOL = $84 时）
  - 手续费：0.04% = $0.04
  - 存入金库：+$99.96
  - 代币发送至钱包
```

### 赎回（兑换 shortSOL）

```
用户 → shortSOL → 协议 → USDC

示例：1.0 shortSOL → ~$85.67 USDC（SOL = $84 时）
  - 手续费：0.04% = $0.03
  - 从金库支出：-$85.67
```

### 滑点保护

所有铸造/赎回交易均包含 `min_tokens_out` / `min_usdc_out` — 如果价格变动超出允许阈值，交易将被回滚。默认值：1%。

---

## 手续费

| 参数 | 值 |
|----------|----------|
| **基础费率** | 4 bps (0.04%) |
| **动态费率** | 4–20 bps（取决于金库健康状况） |
| **往返费用** | 0.08%（铸造 + 赎回） |
| **费用分配** | 进入金库 → LP 提供者 |

### 动态费率阶梯

| 金库覆盖率 | 费率 |
|---------------|-----|
| > 200% | 0.04%（基础） |
| 100–200% | 0.08%（2 倍） |
| < 100% | 0.20%（5 倍） |

---

## 资金费率

| 参数 | 值 |
|----------|----------|
| **费率** | 10 bps/天（~30.6%/年） |
| **机制** | k 衰减 — k 每天减少 0.1% |
| **应用方式** | 在铸造/赎回时内联计算，无需 keeper 依赖 |
| **目的** | 补偿 LP 提供者承担的持仓风险 |

---

## 安全机制

### 熔断机制
- **触发条件**：金库覆盖率 < 95%
- **操作**：自动暂停所有操作
- **公式**：`coverage = vault_balance / (circulating × shortSOL_price)`
- **当前覆盖率**：~6,400%（健康）

### 预言机验证（4 级）
1. **过期检查**：价格不超过 259,200 秒（devnet）
2. **置信度检查**：Pyth 置信区间 < 2%
3. **偏差检查**：与缓存偏差 < 15%（铸造/赎回）
4. **价格下限**：SOL > $1.00

### 速率限制
- 同一用户操作间隔 2 秒冷却期
- 防范三明治攻击

---

## Holging 策略

**50% SOL + 50% shortSOL = 在任何价格波动中获利**

```
P&L = (x − 1)² / (2x)    where x = SOL_price / SOL_price₀
```

根据 AM-GM 不等式：`V(x) = (x + 1/x) / 2 ≥ 1`，对所有 x > 0 成立。

| SOL 变动 | Holging 收益 | 基于 $10,000 |
|-------------|-------------|------------|
| −50% | +25.0% | +$2,500 |
| −25% | +4.2% | +$417 |
| 0% | 0.0% | $0 |
| +25% | +2.5% | +$250 |
| +50% | +8.3% | +$833 |
| +100% | +25.0% | +$2,500 |

**盈亏平衡点**：SOL ±4% 以覆盖 0.08% 的往返手续费。

---

## 链接

| 资源 | URL |
|--------|-----|
| **应用** | https://holging.com |
| **GitHub** | https://github.com/holging/holging |
| **Solana 浏览器（铸币地址）** | https://explorer.solana.com/address/8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2?cluster=devnet |
| **Solana 浏览器（程序）** | https://explorer.solana.com/address/CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX?cluster=devnet |
| **Solana 浏览器（金库）** | https://explorer.solana.com/address/AQ3vTfWBHBY2gPdc5SSK7M33RN5waN6ByPKwMdhtnEr1?cluster=devnet |
| **Pyth SOL/USD** | https://pyth.network/price-feeds/crypto-sol-usd |
| **数学推导** | https://github.com/holging/docs/blob/main/math/MATH.md |
| **Lean 4 证明** | https://github.com/holging/holging/tree/main/lean-proofs |

---

*shortSOL — 一键做空 SOL。无保证金、无清算、无到期日。*
