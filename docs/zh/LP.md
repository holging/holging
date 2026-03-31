# Holging LP — 流动性提供者指南

> 最后更新：2026-03-29
> 协议：Holging (CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX)
> 网络：Solana Devnet → Mainnet（准备中）

---

## 1. 什么是 Holging 中的 LP？

Holging 中的流动性提供者（LP）是**向协议 vault 存入 USDC** 的参与者，为用户的 shortSOL mint 和 redeem 操作提供流动性。作为回报，LP 获得：

- **LP 代币** — 代表池中份额的 SPL 代币
- **交易手续费** — 每笔 mint/redeem 产生的 100% 手续费
- **Funding Rate 收入** — k decay 释放的 USDC

Holging 中的 LP 类似于**承销商**：您承担与 SOL 反向敞口的对手方风险，换取稳定收益。

---

## 2. 工作原理

### 2.1 存入流动性

```
您存入 USDC → 获得 LP 代币
```

- 最低存款：**$100 USDC**
- LP 代币按照您在 `lp_principal` 中的份额比例铸造
- 使用 **dead shares pattern**（ERC-4626）— 防止首个存款人攻击
- 公式：`shares = usdc_amount × (total_supply + 1000) / (principal + 1000)`

### 2.2 收益机制

LP 从**两个来源**获得收益：

#### 来源 1：交易手续费（Fee APY）
每次 shortSOL 的 mint 和 redeem 都会产生手续费，通过 fee-per-share accumulator（精度 1e12）**全部**分配给 LP。

| Vault 状态 | 手续费（每方向） | Roundtrip | 触发条件 |
|------------|------------------|-----------|----------|
| > 200% (healthy) | 20 bps (0.20%) | 0.40% | Vault 超额抵押 |
| 150–200% (normal) | 40 bps (0.40%) | 0.80% | 标准运行 |
| 100–150% (elevated) | 60 bps (0.60%) | 1.20% | 压力状态 — 手续费上升 |
| < 100%（临界） | 80 bps (0.80%) | 1.60% | Vault 自动保护 |

> 动态手续费是内置稳定器：在 vault 承压时，高手续费减缓 redemptions 并吸引新的 mint，恢复池的健康状态。

#### 来源 2：Funding Rate（k-Decay APY）
协议对参数 `k` 应用持续衰减（默认 10 bps/天）。这减少了 vault 对 shortSOL 持有者的义务，差额（释放的 USDC）分配给 LP。

```
k_new = k_old × (864,000,000 − rate × elapsed) / 864,000,000
```

- **10 bps/天** = 0.10%/天 = **30.59% 复合年化**
- 该收益**不依赖于交易量** — 这是 LP 的基底收益（floor yield）
- Funding 是对 vault 对手方风险的补偿

### 2.3 提取流动性

```
销毁 LP 代币 → 按 principal 比例获得 USDC
调用 claim_lp_fees → 获得累积的手续费
```

- 提取 principal 和 claim fees 是**独立操作**（这是一种保护机制：fees 不影响 share price）
- 提取时会检查 vault 健康度：余额必须 ≥ **110% 义务**
- 如果 vault 抵押不足 — 提取将被锁定（保护其他 LP 和用户）

---

## 3. 收益率（APY）

### 3.1 收益模型

| 来源 | 公式 | 依赖因素 |
|------|------|----------|
| **Fee APY** | `daily_volume × roundtrip_fee × 365 / TVL` | 交易量 |
| **Funding APY** | `TVL × 0.001 × 365 / TVL = 36.50%` | 常数（基底收益） |
| **总 APY** | Fee APY + Funding APY | |

### 3.2 预测场景

在健康 vault（>200%，roundtrip fee = 0.40%）下：

| 场景 | TVL | 日交易量 | Fee APY | Funding APY | **总 APY** |
|------|-----|----------|---------|-------------|------------|
| 保守 | $500K | $100K | 29.20% | 36.50% | **65.70%** |
| 适中 | $1M | $250K | 36.50% | 36.50% | **73.00%** |
| 激进 | $2M | $500K | 36.50% | 36.50% | **73.00%** |

在压力 vault（150–200%，roundtrip fee = 0.80%）下：

| 场景 | TVL | 日交易量 | Fee APY | Funding APY | **总 APY** |
|------|-----|----------|---------|-------------|------------|
| 保守 | $500K | $100K | 58.40% | 36.50% | **94.90%** |
| 适中 | $1M | $250K | 73.00% | 36.50% | **109.50%** |
| 激进 | $2M | $500K | 73.00% | 36.50% | **109.50%** |

### 3.3 关键洞察

**Funding APY（36.5%）是有保障的最低收益**，不依赖于交易量。即使交易量为零，LP 也能通过 k-decay 获得约 36.5% 的年化收益。Fee APY 是额外的奖励，取决于用户活跃度。

> 作为对比：Jupiter 的 JLP 约 15–25% APY，Drift DLP 约 10–20% APY，Kamino vaults 约 5–15% APY。

---

## 4. LP 的风险

### 🔴 风险 1：SOL 下跌时的 vault 压力（高）

**核心问题：** 当 SOL 下跌时，shortSOL 升值（`shortSOL_price = k / SOL_price`）。vault 对 shortSOL 持有者的义务增加，而 vault 中的 USDC 保持不变。

**示例：**
- LP 在 SOL = $170 时存入 $100,000 USDC
- 用户 mint 了 $50,000 的 shortSOL
- SOL 跌至 $85（−50%）：shortSOL 价格翻倍
- vault 义务：$50,000 → $100,000
- Vault ratio：$150,000 / $100,000 = 150%（压力，但非临界）

**临界阈值：**
- Vault ratio < 95% → Circuit Breaker：所有 redeem 被锁定
- Vault ratio < 110% → LP 提取被锁定

**保护机制：**
- ✅ Circuit Breaker（95%）— 自动暂停直到恢复
- ✅ 动态手续费 — 压力时增至 80 bps，吸引新的 mint
- ✅ Funding Rate（k-decay）— 持续减少义务
- ✅ LP 提取在 ratio < 110% 时被锁定 — 防止银行挤兑

**对 LP 意味着什么：** 在极端情况下（SOL −80%+），您的 USDC 可能会被暂时锁定在 vault 中，直到价格恢复或新 LP 进入。

---

### 🟡 风险 2：k-decay 带来的无常损失（中）

**核心问题：** k-decay 在 SOL 价格不变时降低 shortSOL_price。这对 LP 有利（减少义务），但如果 SOL 下跌幅度超过 k-decay 的补偿 — LP 将承受损失。

**LP 潜在损失公式：**
```
LP_loss = obligations_at_current_price − vault_balance
        = (circulating × k / SOL_price / 1e12) − vault_USDC
```

**保护机制：** k-decay 充当内置保险 — 每天约 0.1% 的义务自动缩减，即使 SOL 价格不动。

---

### 🟡 风险 3：智能合约风险（中）

**核心问题：** 协议部署在 Solana 上。程序中的任何 bug 都可能导致资金损失。

**当前保护措施：**
- ✅ Checked arithmetic（所有运算都有溢出保护）
- ✅ Vault reconciliation（每次 CPI 转账后 `reload()` + assert）
- ✅ 19 条指令，21 个错误代码，17 种事件类型
- ✅ 4 级 Pyth 预言机验证
- ✅ Rate limiting（操作间隔 2 秒）
- ✅ Two-step authority transfer
- ✅ Dead shares（ERC-4626）— 防止 share inflation
- ✅ MIN_K floor — 防止 k→0

**尚未完成：**
- ⚠️ 专业审计（OtterSec/Neodyme）— 计划在 mainnet 上线前完成
- ⚠️ admin 参数无 timelock（admin 可以立即更改 fee、funding rate）
- ⚠️ 程序在 devnet 上 — 尚未经过 mainnet 负载测试

---

### 🟡 风险 4：预言机风险（中）

**核心问题：** shortSOL 价格由 Pyth 预言机决定。预言机的错误或操纵 = 错误的 mint/redeem。

**4 级保护：**

| 检查 | 阈值 | 过滤目标 |
|------|------|----------|
| Staleness | 30 秒（mainnet）/ 86400 秒（devnet） | 过期数据 |
| Confidence | CI < 价格的 2% | 不精确数据 |
| Deviation | < 缓存价格的 15% | 剧烈波动 / 操纵 |
| Floor | > $1.00 | 零值 / 负值价格 |

**残余风险：** Pyth 是唯一的预言机，没有 fallback。Pyth 宕机 = 协议暂停。

---

### 🟢 风险 5：管理员风险（低）

**核心问题：** 管理员可以更改参数：fee、funding rate、最低 LP 存款、暂停。

**管理员可以做什么：**
| 操作 | 限制 |
|------|------|
| 更改 fee | 最大 100 bps (1%) |
| 更改 funding rate | 最大 100 bps/天 |
| 提取 fees | 仅限超出 110% obligations + LP principal + LP pending fees 的部分 |
| 暂停协议 | 双向 |
| 更换 authority | Two-step：propose → accept |

**管理员不能做什么：**
- ❌ 提取 LP principal（在 `withdraw_fees` 中受保护）
- ❌ 提取 pending LP fees（在 `withdraw_fees` 中受保护）
- ❌ 在 circulating > 0 时更改 k
- ❌ 直接 mint/提取 shortSOL

---

### 🟢 风险 6：流动性锁定（低）

**核心问题：** 当 vault health < 110% 时，LP 无法提取资金。

**何时发生：** 仅在 SOL 大幅下跌、vault 义务接近余额时。正常条件下，流动性完全可用。

**保护机制：** Circuit breaker 在 95% 时停止新的 redemptions，稳定 vault 并允许 LP 在恢复后提取资金。

---

## 5. 与替代方案的比较

| 参数 | Holging LP | JLP (Jupiter) | DLP (Drift) | Kamino Vaults |
|------|-----------|--------------|------------|---------------|
| **基础 APY** | ~37–40% | 15–25% | 10–20% | 5–15% |
| **基底收益** | 36.5%（funding） | 0%（仅 fees） | 0%（仅 fees） | 0% |
| **无常损失风险** | 是（SOL 下跌时） | 是（交易者 PnL） | 是（AMM PnL） | 最小 |
| **LP 清算** | 无 | 无 | 无 | 无 |
| **锁仓期** | 无（但有 vault health check） | 无 | 无 | 部分 vault |
| **最低存款** | $100 | 无 | 无 | 不等 |
| **可组合性** | LP 代币（SPL） | JLP 代币（SPL） | 仓位 | Vault shares |
| **审计** | 进行中 | 是（OtterSec） | 是（OtterSec） | 是 |

---

## 6. 如何成为 LP

### 6.1 通过前端（holging.com）

1. 连接钱包（Phantom / Solflare）— 设置为 **Devnet**
2. 通过 Faucet 获取测试 USDC（网站上的按钮）
3. 进入 **LP Dashboard** 页面
4. 输入金额（最低 $100 USDC）并点击 **Add Liquidity**
5. 在钱包中确认交易
6. 您的 LP 代币将出现在钱包中

### 6.2 通过 CLI（高级用户）

```bash
# 添加流动性（10,000 USDC）
npx ts-node scripts/add-liquidity.ts --amount 10000

# 查看仓位
# LP position PDA: ["lp_position", pool_state, your_pubkey]

# 领取累积的 fees
# claim_lp_fees 通过 program.methods.claimLpFees(POOL_ID)

# 提取流动性（50% shares）
# remove_liquidity 通过 program.methods.removeLiquidity(POOL_ID, halfShares)
```

### 6.3 LP 操作

| 操作 | 指令 | 权限 | 手续费 |
|------|------|------|--------|
| 存入 USDC | `add_liquidity` | 任何人（permissionless） | 无 |
| 提取 USDC | `remove_liquidity` | LP position 所有者 | 无（但有 vault health check） |
| 领取 fees | `claim_lp_fees` | LP position 所有者 | 无 |

---

## 7. 常见问题

### 我的存款会亏损吗？

**部分可能 — 是的。** 在极端情况下（SOL 在短期内跌幅超过 80%，circuit breaker 触发之前），vault 义务可能超过余额。在这种情况下，您的按比例提取金额将少于存款。但是：
- Funding rate（k-decay）持续减少义务，降低此风险
- Circuit breaker 在 ratio < 95% 时停止 redemptions
- 动态手续费在 vault 承压时自动提高

### 我何时获得收益？

**持续获得。** 每次协议中的 mint/redeem 都会将手续费记入您的 `pending_fees`。Funding rate 收入在每次调用 `accrue_funding` 时添加（keeper 每小时一次，或在 mint/redeem 时内联执行）。您可以随时通过 `claim_lp_fees` 领取累积的手续费。

### Circuit breaker 触发时会怎样？

所有 redeem 操作被锁定。Mint 操作**仍然可用** — 这允许新用户存入 USDC 并恢复 vault ratio。一旦 ratio > 95%，redemptions 将自动恢复（admin 取消暂停）。

### 我可以随时提取资金吗？

**是的，如果 vault ratio ≥ 110%。** 如果 ratio 更低 — 提取将被锁定直到恢复。Claim fees 始终可用（只要协议未暂停且 vault 中有 USDC）。

### 有哪些防止 admin rugpull 的保障？

- Admin **不能**提取 LP principal 或 pending fees（在 `withdraw_fees` 中受保护）
- Admin **不能**在 circulating > 0 时更改 k
- Admin authority transfer 是**两步操作**（propose + accept）
- 所有 admin 操作都会发出链上事件以供监控

### 这与 Jupiter 上的 JLP 有什么区别？

JLP 是杠杆交易者的对手方：当交易者亏损时 LP 赚钱，反之亦然。在 Holging 中，LP 获得**稳定的 funding rate（36.5% APY）**+ 交易手续费，但承担与 SOL 反向敞口的对手方风险。主要区别在于基底收益：即使交易量为零，Holging LP 也能获得收益。

---

## 8. 联系方式和资源

- **网站：** [holging.com](https://holging.com)
- **Program ID：** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
- **数学推导：** [SOLSHORT_MATH.md](../SOLSHORT_MATH.md)
- **安全审计：** [docs/SECURITY_AUDIT.md](SECURITY_AUDIT.md)
- **商业分析：** [docs/BUSINESS_ANALYSIS.md](BUSINESS_ANALYSIS.md)

---

*本文档仅供参考，不构成财务建议。所有 APY 均为预测值，基于协议当前参数，可能会发生变化。DeFi 存在资金损失风险。*
