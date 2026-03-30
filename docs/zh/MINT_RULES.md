# Mint — 代币铸造规则

> Holging 协议中创建 inverse 代币的完整流程说明。

---

## 概述

Mint — 存入 USDC 以获取 inverse 代币（shortSOL、shortTSLA 等）的操作。

```
用户 → USDC → 协议 → inverse token
```

**核心原则：** 代币仅由程序根据公式、基于 Pyth oracle 价格铸造。任何人——无论是 admin 还是用户——都无法在 vault 中没有 USDC 担保的情况下创建代币。

---

## 铸造公式

```
1. shortsol_price = k × 1e9 / SOL_price

2. dynamic_fee = calc_dynamic_fee(base_fee, vault, circulating, k, price)

3. fee_amount = usdc_amount × dynamic_fee / 10000

4. effective_usdc = usdc_amount − fee_amount

5. tokens = effective_usdc × 1000 × 1e9 / shortsol_price
            ↑ scaling 1e6→1e9   ↑ PRICE_PRECISION
```

### 示例

```
Input:        100 USDC
SOL price:    $84.57
k:            7,197,715,091,917
shortSOL:     $85.11 (= k × 1e9 / 84,570,000,000)
Coverage:     6,446% (> 200%)
Dynamic fee:  2 bps (0.02%) — 折扣费率

Fee:          100 × 2 / 10000 = $0.02
Effective:    $99.98
Tokens:       99.98 × 1000 × 1e9 / 85,110,000,000 = 1.1748 shortSOL

Output:       1.1748 shortSOL → 用户钱包
Vault:        +$100 USDC
```

---

## 逐步流程（on-chain）

### 1. 铸造前检查

| 检查项 | 条件 | 错误 |
|--------|------|------|
| 池未暂停 | `!pool.paused` | `Paused` |
| 金额 > 0 | `usdc_amount > 0` | `AmountTooSmall` |
| 频率限制 | `>= 2 秒自上次操作` | `RateLimitExceeded` |
| Funding 配置 | 若存在则必须传入 | `FundingConfigRequired` |

### 2. Funding（若传入 FundingConfig）

```
在计算价格之前应用 k-decay：
  elapsed = now − last_accrued
  periods = elapsed / 86400  (经过天数)
  k_new = k × (1 − rate_bps/10000)^periods

Funding 降低 k → shortSOL 随时间变便宜。
当前费率：10 bps/day = 0.1%/day ≈ 30.6%/year
```

### 3. Oracle 验证（4 级）

| 级别 | 参数 | 值（devnet） | 说明 |
|------|------|-------------|------|
| 1 | Staleness | 259,200 秒（3 天） | Pyth 价格不超过 N 秒 |
| 2 | Confidence | < 2% | Pyth 置信区间 |
| 3 | Deviation | < 15%（1500 bps） | 与缓存价格的偏差 |
| 4 | Floor | > $1.00 | 资产最低价格 |

若任一检查失败 → `StaleOracle`、`PriceBelowMinimum` 或 `PriceDeviationTooLarge`。

### 4. 动态手续费计算

| Vault Coverage | 费率 | bps | 说明 |
|---------------|------|-----|------|
| > 200% | base/2 | 2 bps | Vault 健康 → 折扣 |
| 150–200% | base×5 | 20 bps | 正常 |
| 100–150% | base×10 | 40 bps | 较高 |
| < 100% | base×20 | 80 bps | 危急 |

最大值：100 bps（1%）。最小值：1 bps。

### 5. 转移 USDC → Vault

```
CPI: TokenProgram.Transfer
  from: user_usdc (ATA)
  to:   vault_usdc (PDA)
  amount: usdc_amount (全额，fee 留在 vault 中)
```

### 6. 铸造代币 → 用户

```
CPI: TokenProgram.MintTo
  mint:      shortsol_mint (PDA)
  to:        user_shortsol (ATA)
  authority: mint_authority (PDA, 由程序签名)
  amount:    tokens (在步骤 4 中计算)
```

### 7. Vault 对账

```
vault_usdc.reload()  // 从链上重新读取实际余额
require!(vault_usdc.amount >= expected)  // 验证 CPI 未作弊
```

若 vault 实际余额低于预期 → `InsufficientLiquidity`。

### 8. 更新 Pool State

```
pool.circulating   += tokens
pool.total_minted  += tokens
pool.vault_balance  = expected_vault (reconciled)
pool.total_fees    += fee_amount
pool.last_oracle_price     = sol_price
pool.last_oracle_timestamp = oracle.timestamp
```

### 9. 手续费分配（LP）

```
若 LP total supply > 0：
  fee_per_share += fee_amount × 1e12 / lp_total_supply
  total_lp_fees_pending += fee_amount

手续费按 LP shares 比例分配。
```

### 10. 事件发射

```rust
MintEvent {
    user:           wallet pubkey
    usdc_in:        100_000_000 (100 USDC)
    tokens_out:     1_174_800_000 (1.1748 shortSOL)
    sol_price:      84_570_000_000 ($84.57)
    shortsol_price: 85_110_000_000 ($85.11)
    fee:            20_000 ($0.02)
    timestamp:      1774870000
}
```

---

## 滑点保护

用户传入 `min_tokens_out` — 最小代币数量。若计算数量 < min → 交易回滚，报错 `SlippageExceeded`。

```
前端：min_tokens_out = expected × (1 − slippage_bps / 10000)
默认滑点：1%（100 bps）
MCP Server：2%（200 bps）
```

---

## 交易账户

| # | 账户 | 类型 | 说明 |
|---|------|------|------|
| 1 | `pool_state` | PDA, mut | 池状态 |
| 2 | `vault_usdc` | PDA, mut | USDC 金库 |
| 3 | `shortsol_mint` | PDA, mut | Inverse 代币 mint |
| 4 | `mint_authority` | PDA | MintTo 签名者 |
| 5 | `price_update` | Account | Pyth PriceUpdateV2 |
| 6 | `usdc_mint` | Account | USDC mint |
| 7 | `user_usdc` | ATA, mut | 用户的 USDC |
| 8 | `user_shortsol` | ATA, mut | 用户的 inverse 代币 |
| 9 | `user` | Signer, mut | 用户钱包 |
| 10 | `funding_config` | PDA, mut, optional | Funding 配置 |
| 11 | `token_program` | Program | SPL Token |
| 12 | `system_program` | Program | System |

---

## 限制

| 限制 | 值 | 原因 |
|------|----|------|
| 最小金额 | > 0 USDC | 防止空交易 |
| 频率限制 | 操作间隔 2 秒 | 防三明治攻击 |
| 最大手续费 | 1%（100 bps） | calc_dynamic_fee 上限 |
| Oracle 过期时间 | 259,200 秒（devnet） | 股票数据源在周末不更新 |
| Oracle 偏差 | 与缓存相差 15% | 防价格操纵 |
| Oracle 置信度 | < 2% | Pyth confidence 检查 |
| 价格下限 | > $1.00 | 防极端崩盘 |
| Funding 必需 | 若 FundingConfig 存在 | MEDIUM-02 修复 |

---

## 错误代码（Mint）

| 代码 | Hex | 名称 | 说明 |
|------|-----|------|------|
| 6000 | 0x1770 | Paused | 池已暂停 |
| 6001 | 0x1771 | StaleOracle | 价格过期或 feed_id 无效 |
| 6002 | 0x1772 | PriceBelowMinimum | SOL < $1.00 |
| 6003 | 0x1773 | PriceDeviationTooLarge | 偏差 > 15% |
| 6004 | 0x1774 | InsufficientLiquidity | Vault 对账失败 |
| 6005 | 0x1775 | AmountTooSmall | amount = 0 |
| 6006 | 0x1776 | MathOverflow | 算术溢出 |
| 6007 | 0x1777 | SlippageExceeded | tokens < min_tokens_out |
| 6010 | 0x177A | RateLimitExceeded | 距上次操作 < 2 秒 |
| 6018 | 0x1782 | FundingConfigRequired | 未传入 FundingConfig |

---

## 通过 MCP 调用

```
# 模拟（无交易）
→ simulate_mint { "usdc_amount": 100, "pool_id": "sol" }
← { "expectedOutput": "1.1748 shortSOL", "fee": "$0.02", "feePercent": "0.02%" }

# 执行
→ mint { "usdc_amount": 100, "pool_id": "sol" }
← { "success": true, "signature": "3tAM59...", "explorer": "https://..." }
```

---

## 通过前端调用

```typescript
const { mint } = useSolshort("sol");
await mint(
  new BN(100_000_000),           // 100 USDC
  new PublicKey("CAMk3...heeGn") // USDC mint
);
```

前端自动完成：
1. 发布 Pyth price update（PythSolanaReceiver SDK）
2. 按需创建 ATA
3. 计算滑点保护（1%）
4. 在同一交易中发送 updatePrice + mint

---

*Mint — 创建 inverse 代币的唯一方式。每个代币均由 vault 中的 USDC 担保。*
