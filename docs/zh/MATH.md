# Holging — 数学架构

## 概述

Holging 是一个基于 Solana 的代币化反向敞口协议。用户存入 USDC 来铸造 **shortSOL** 代币，其价值与 SOL 价格反向变动。核心创新是 **holging** 策略 — 一个 50/50 的 SOL + shortSOL 投资组合，在数学上保证无论价格方向如何都能盈利。

**Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
**网络:** Devnet

---

## 1. 常量

| 符号 | 值 | 说明 |
|--------|-------|-------------|
| `PRICE_PRECISION` | 10⁹ | 定点数缩放因子 |
| `USDC_DECIMALS` | 6 | 1 USDC = 10⁶ 基本单位 |
| `SHORTSOL_DECIMALS` | 9 | 1 shortSOL = 10⁹ 基本单位 |
| `DECIMAL_SCALING` | 10³ | = 10^(9−6)，用于 USDC↔shortSOL 转换 |
| `BPS_DENOMINATOR` | 10,000 | 基点分母 |
| `DEFAULT_FEE_BPS` | 4 | 0.04% 手续费 |
| `MIN_VAULT_RATIO_BPS` | 9,500 | 熔断器阈值 95% |
| `MIN_VAULT_POST_WITHDRAWAL_BPS` | 11,000 | 管理员提取下限 110% |
| `MAX_PRICE_DEVIATION_BPS` | 1,500 | 与缓存价格的最大偏差 15% |
| `MAX_CONFIDENCE_PCT` | 2 | 预言机置信区间 2% |
| `MAX_STALENESS_SECS` | 120 | 预言机新鲜度 120 秒（devnet） |
| `MIN_PRICE` | 10⁹ | 价格下限：$1.00 SOL |
| `SECS_PER_DAY` | 86,400 | 每天秒数（资金费率分母） |
| `MAX_FUNDING_RATE_BPS` | 100 | k 衰减上限：1%/天 ≈ 97% 年化复利 |
| `MAX_FUNDING_ELAPSED_SECS` | 2,592,000 | 每次 `accrue_funding` 调用的最大经过时间（30 天） |

---

## 2. 核心定价函数

### 2.1 shortSOL 价格

shortSOL 价格是 SOL 价格的反向（倒数）函数：

$$
\text{shortSOL\_price}(t) = \frac{k \times \text{PRICE\_PRECISION}}{P_{\text{SOL}}(t)}
$$

其中：
- $P_{\text{SOL}}(t)$ — 当前 SOL/USD 价格（缩放 ×10⁹）
- $k$ — 归一化常量（u128）

### 2.2 常量 k（初始化）

$$
k = \frac{P_0^2}{\text{PRICE\_PRECISION}}
$$

其中 $P_0$ 是池子初始化时的 SOL 价格。

**性质：** 初始化时，shortSOL 的起始价格与 SOL 相同：

$$
\text{shortSOL}(0) = \frac{k \times \text{PRICE\_PRECISION}}{P_0} = \frac{P_0^2 / \text{PRICE\_PRECISION} \times \text{PRICE\_PRECISION}}{P_0} = P_0
$$

### 2.3 k 是收益中性的

收益与 k 无关：

$$
\text{Return} = \frac{\text{shortSOL}(t_1)}{\text{shortSOL}(t_0)} - 1 = \frac{k / P_1}{k / P_0} - 1 = \frac{P_0}{P_1} - 1
$$

具有不同 k 值的两个池子产生相同的百分比收益。

---

## 3. 铸造（USDC → shortSOL）

### 3.1 手续费扣除

$$
\text{fee} = \frac{\text{usdc\_amount} \times \text{fee\_bps}}{10{,}000}
$$

$$
\text{effective\_usdc} = \text{usdc\_amount} - \text{fee}
$$

### 3.2 铸造代币数量

$$
\text{tokens} = \frac{\text{effective\_usdc} \times \text{DECIMAL\_SCALING} \times \text{PRICE\_PRECISION}}{\text{shortSOL\_price}}
$$

展开形式：

$$
\text{tokens} = \frac{\text{effective\_usdc} \times 10^3 \times 10^9}{\text{shortSOL\_price}}
$$

### 3.3 状态更新

```
circulating     += tokens
total_minted    += tokens
vault_balance   += usdc_amount    ← 全额（手续费留在金库中）
fees_collected  += fee
```

### 3.4 数值示例

SOL = $170，k = 28,900 × 10⁹，用户存入 170 USDC：

```
shortSOL_price = 28,900×10⁹ × 10⁹ / (170×10⁹) = 170×10⁹
fee = 170,000,000 × 4 / 10,000 = 68,000 (= $0.068)
effective_usdc = 170,000,000 − 68,000 = 169,932,000
tokens = 169,932,000 × 1,000 × 10⁹ / (170×10⁹) = 999,600,000 (≈ 0.9996 shortSOL)
```

---

## 4. 赎回（shortSOL → USDC）

### 4.1 总 USDC 输出

$$
\text{gross\_usdc} = \frac{\text{shortsol\_amount} \times \text{shortSOL\_price}}{\text{PRICE\_PRECISION} \times \text{DECIMAL\_SCALING}}
$$

### 4.2 手续费（买方侧）

$$
\text{fee} = \frac{\text{gross\_usdc} \times \text{fee\_bps}}{10{,}000}
$$

$$
\text{net\_usdc} = \text{gross\_usdc} - \text{fee}
$$

### 4.3 状态更新

```
circulating     -= shortsol_amount
total_redeemed  += shortsol_amount
vault_balance   -= net_usdc       ← 手续费留在金库中
fees_collected  += fee
```

### 4.4 有效价差

$$
\text{Spread} = \text{Ask} - \text{Bid} = \text{shortSOL\_price} \times \frac{2 \times \text{fee\_bps}}{10{,}000} = \text{shortSOL\_price} \times 0.08\%
$$

---

## 5. 预言机验证

### 5.1 Pyth 价格转换

Pyth 返回 `(price, exponent)`。示例：price=17250，expo=−2 表示 $172.50。

$$
\text{adjusted\_price} = \begin{cases}
\text{raw\_price} \times 10^{\text{expo}} \times \text{PRICE\_PRECISION} & \text{if expo} \geq 0 \\
\frac{\text{raw\_price} \times \text{PRICE\_PRECISION}}{10^{|\text{expo}|}} & \text{if expo} < 0
\end{cases}
$$

### 5.2 置信度检查

$$
\text{conf\_pct} = \frac{\text{adjusted\_conf} \times 100}{\text{adjusted\_price}} < 2\%
$$

### 5.3 偏差检查（与缓存价格比较）

$$
\text{deviation\_bps} = \frac{|\text{adjusted\_price} - \text{last\_cached\_price}| \times 10{,}000}{\text{last\_cached\_price}} \leq 1{,}500
$$

### 5.4 安全守护汇总

| 守护项 | 条件 | 错误 |
|-------|-----------|-------|
| 过期检查 | age > 120s | `StaleOracle` |
| 置信度 | conf > 价格的 2% | `OracleConfidenceTooWide` |
| 偏差 | Δ > 与缓存价格偏差 15% | `PriceDeviationTooHigh` |
| 价格下限 | price < $1.00 | `PriceBelowMinimum` |

---

## 6. 熔断机制

### 6.1 金库债务

赎回后，剩余债务为：

$$
\text{obligations} = \frac{\text{remaining\_circulating} \times \text{shortSOL\_price}}{\text{PRICE\_PRECISION} \times \text{DECIMAL\_SCALING}}
$$

### 6.2 金库比率

$$
\text{vault\_ratio\_bps} = \frac{\text{remaining\_vault} \times 10{,}000}{\text{obligations}}
$$

### 6.3 触发条件

$$
\text{vault\_ratio\_bps} < 9{,}500 \implies \text{pool.paused} = \texttt{true}
$$

交易将被拒绝并返回 `CircuitBreaker` 错误。

### 6.4 偿付能力分析

在价格 $P_0$ 时进行单次铸造，价格变动至 $P_1$ 后：

$$
\text{ratio} = \frac{P_1}{P_0} \times (1 + \text{fee})
$$

- 若 $P_1 > P_0$（SOL 上涨）：ratio > 1，超额抵押 ✓
- 若 $P_1 < P_0$（SOL 下跌）：金库压力增大
- 熔断器在比率降至 95% 以下之前触发

---

## 7. Holging 策略

### 7.1 投资组合定义

Holging = 50% SOL + 50% shortSOL（等额美元分配）。

设 $x = P(t) / P(0)$ 为 SOL 价格乘数：

$$
V(x) = \frac{1}{2} \cdot x + \frac{1}{2} \cdot \frac{1}{x} = \frac{x + 1/x}{2}
$$

### 7.2 AM-GM 保证

根据算术平均-几何平均不等式：

$$
\frac{x + 1/x}{2} \geq \sqrt{x \cdot \frac{1}{x}} = 1 \quad \forall\, x > 0
$$

**因此：** $V(x) \geq 1$ 恒成立。投资组合永远不会亏损（不计手续费）。

### 7.3 盈亏公式

$$
\text{P\&L}(x) = V(x) - 1 = \frac{x + 1/x}{2} - 1 = \frac{(x - 1)^2}{2x}
$$

最小值在 $x = 1$（价格未变动）时取得，$\text{P\&L} = 0$。

### 7.4 导数（Greeks）

一阶导数（delta）：
$$
\frac{dV}{dP} = \frac{1}{2P_0} - \frac{P_0}{2P^2}
$$

当 $P = P_0$ 时：delta = 0（delta 中性）。

二阶导数（gamma）：
$$
\frac{d^2V}{dP^2} = \frac{P_0}{P^3} > 0 \quad \forall\, P > 0
$$

**处处为正 gamma** — 投资组合在任一方向的波动中都能获益。

### 7.5 情景分析表

| SOL 变动 | x | SOL 盈亏 | shortSOL 盈亏 | 组合盈亏 |
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

### 7.6 实际盈亏（含手续费）

$$
\text{Real P\&L} = \frac{(x-1)^2}{2x} - 2 \times \text{fee\_roundtrip} - \text{gas}
$$

当 fee_bps = 4 时：往返成本 = 0.08%。盈亏平衡需要：

$$
\frac{(x-1)^2}{2x} > 0.0008
$$

大约：SOL 必须变动 ±4% 才能在扣除手续费后盈利。

---

## 8. 代币精度处理

### 8.1 转换表

| 代币 | 精度 | 1 单位 = | 基本单位名称 |
|-------|----------|----------|----------------|
| USDC | 6 | 1,000,000 基本单位 | "USDC lamports" |
| shortSOL | 9 | 1,000,000,000 基本单位 | "shortSOL lamports" |
| SOL | 9 | 1,000,000,000 lamports | lamports |

### 8.2 缩放因子

$$
\text{DECIMAL\_SCALING} = 10^{(\text{SHORTSOL\_DEC} - \text{USDC\_DEC})} = 10^{(9-6)} = 1{,}000
$$

在铸造（乘法）和赎回（除法）中均用于弥合精度差异。

---

## 9. 池子状态

```
PoolState {
    authority:            Pubkey     // 管理员密钥
    pending_authority:    Pubkey     // 待确认的新管理员（两步转移）
    k:                    u128       // 定价常量（通过资金费率进行 k 衰减）
    fee_bps:              u16        // 基点手续费
    total_minted:         u64        // 累计铸造代币数
    total_redeemed:       u64        // 累计赎回代币数
    circulating:          u64        // 当前流通量（铸造 − 赎回）
    total_fees_collected: u64        // 累计手续费（USDC）
    vault_balance:        u64        // 金库中的 USDC
    pyth_feed:            Pubkey     // 预言机 feed 地址
    shortsol_mint:        Pubkey     // 代币铸造地址
    paused:               bool       // 紧急停止
    last_oracle_price:    u64        // 缓存的 SOL 价格
    last_oracle_timestamp: i64       // 缓存时间戳
    bump:                 u8         // Pool PDA bump
    mint_auth_bump:       u8         // Mint authority PDA bump
}

FundingConfig {
    rate_bps:        u16   // k 衰减速率，基点/天（0 = 禁用）
    last_funding_at: i64   // 上次累计的 Unix 时间戳
    bump:            u8    // PDA bump
}
```

### 不变量

```
circulating = total_minted − total_redeemed
vault_balance = Σ(usdc_in) − Σ(net_usdc_out)
vault_balance ≥ Σ(fees)  (手续费永远不会离开金库)
```

---

## 10. PDA Seeds

| PDA | Seeds | 用途 |
|-----|-------|---------|
| Pool State | `["pool", pool_id]` | 主状态账户 |
| shortSOL Mint | `["shortsol_mint", pool_id]` | 代币铸造 |
| Mint Authority | `["mint_auth", pool_id]` | 铸造签名者 |
| USDC Vault | `["vault", usdc_mint, pool_id]` | 存放 USDC |
| Funding Config | `["funding", pool_state_pubkey]` | k 衰减速率 + 时间戳 |

---

## 11. 错误码

| 错误码 | 名称 | 含义 |
|------|------|---------|
| 6000 | `Paused` | 池子已暂停 |
| 6001 | `StaleOracle` | 价格超过 30 秒未更新 |
| 6002 | `OracleConfidenceTooWide` | 置信度 > 价格的 2% |
| 6003 | `PriceDeviationTooHigh` | Δ > 与缓存偏差 15% |
| 6004 | `InsufficientLiquidity` | 金库无法覆盖赎回或提取 |
| 6005 | `AmountTooSmall` | 金额 = 0 或代币 = 0 |
| 6006 | `CircuitBreaker` | 金库比率 < 95% |
| 6007 | `RateLimitExceeded` | 用户操作间隔 2 秒冷却 |
| 6008 | `PriceBelowMinimum` | SOL < $1.00 |
| 6009 | `MathOverflow` | 算术溢出 |
| 6010 | `Unauthorized` | 权限错误 |
| 6011 | `InvalidFee` | fee_bps > 100 或 rate_bps > MAX_FUNDING_RATE_BPS |
| 6012 | `CirculatingNotZero` | 流通量 > 0 时无法更新 k |
| 6013 | `InvalidPoolId` | Pool ID 超过 32 字节 |
| 6014 | `SlippageExceeded` | 输出低于 min_tokens_out / min_usdc_out |
| 6015 | `NoPendingAuthority` | 在 `transfer_authority` 之前调用了 `accept_authority` |

---

## 12. 事件

### 用户事件
```
MintEvent        { user, usdc_in, tokens_out, sol_price, shortsol_price, fee, timestamp }
RedeemEvent      { user, tokens_in, usdc_out, sol_price, shortsol_price, fee, timestamp }
CircuitBreakerTriggered { vault_ratio_bps, timestamp }
```

### 管理员事件
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

### 资金费率事件
```
FundingAccruedEvent  { k_before, k_after, elapsed_secs, rate_bps, timestamp }
```

---

## 13. 资金费率（k 衰减）

### 13.1 机制

协议通过随时间衰减 `k` 来收取连续资金费率。这是对金库承担非对称支付结构的补偿（shortSOL 持有者从 SOL 下跌中获利，但金库承担损失）。

$$
k_{\text{new}} = k_{\text{old}} \times \frac{\text{denom} - \text{rate\_bps} \times \text{elapsed\_to\_apply}}{\text{denom}}
$$

$$
\text{denom} = \text{SECS\_PER\_DAY} \times \text{BPS\_DENOM} = 86{,}400 \times 10{,}000 = 864{,}000{,}000
$$

### 13.2 费率示例

| rate_bps/天 | 每日衰减 | 年化复利 |
|---|---|---|
| 1 | 0.01% | 3.5% |
| 10 | 0.10% | 30.6% |
| 50 | 0.50% | 83.9% |
| 100 | 1.00% | 97.4% |

### 13.3 Keeper 无关性

资金费率在每次 `mint` 和 `redeem` 调用时 **内联应用**（如果 `FundingConfig` 作为可选账户传入）。这确保用户始终以当前 k 值进行交易，与 keeper 活动无关。

### 13.4 k→0 保护

每次 `accrue_funding` 调用的硬上限为 **30 天**（`MAX_FUNDING_ELAPSED_SECS`），防止 k 在 keeper 离线期间衰减至零。时间戳推进量为 `elapsed_to_apply` 而非 `now` — 未封顶的时间将结转至下次调用。

$$
\text{elapsed\_to\_apply} = \min(\text{elapsed}, \text{MAX\_FUNDING\_ELAPSED\_SECS})
$$

### 13.5 对 shortSOL 价格的影响

由于 `shortSOL_price = k × 10⁹ / SOL_price`，更小的 k 意味着相同 SOL 价格下更低的 shortSOL 价格。不赎回的持有者通过资金费率逐渐损失价值 — 类似于永续合约市场中的资金费率。

---

## 14. 风险分析

### 13.1 金库资不抵债

如果 SOL 大幅下跌，shortSOL 的债务将超过金库余额。95% 的熔断器可以缓解但不能消除风险：

$$
\text{SOL 下跌 50\% 时：ratio} = \frac{P_1}{P_0} \times (1 + \text{fee}) = 0.5 \times 1.0004 = 0.5002
$$

单次铸造 → 50% 抵押率。在不同价格进行多次铸造可以改善该比率。

### 13.2 舍入

所有整数除法向下取整（floor）。在铸造和赎回中，舍入都有利于协议。赎回中的两次连续除法（`/ PRICE_PRECISION / scaling`）比单次合并除法损失更多精度。

### 13.3 预言机

- 30 秒过期窗口允许抢跑交易
- Pyth 的拉取式模型：任何人都可以提交价格更新
- 15% 偏差检查可以通过多笔交易缓慢移动
- 单一预言机，无回退方案

### 13.4 手续费与 Holging 利润

往返手续费 = 0.08%。对于较小的 SOL 变动：

$$
\text{P\&L}(1 + \epsilon) \approx \frac{\epsilon^2}{2} \quad \text{（泰勒展开）}
$$

盈亏平衡：$\epsilon^2 / 2 > 0.0008 \implies |\epsilon| > 4\%$

---

## 15. 公式速查表

| 内容 | 公式 |
|------|---------|
| shortSOL 价格 | $k \times 10^9 / P_{\text{SOL}}$ |
| k（初始化） | $P_0^2 / 10^9$ |
| k（衰减） | $k_{\text{old}} \times (\text{denom} - \text{rate} \times \text{elapsed}) / \text{denom}$ |
| 资金费率分母 | $86{,}400 \times 10{,}000 = 864{,}000{,}000$ |
| 铸造手续费 | $\text{amount} \times \text{fee\_bps} / 10{,}000$ |
| 输出代币 | $\text{effective} \times 10^3 \times 10^9 / \text{ssPrice}$ |
| USDC 输出 | $\text{tokens} \times \text{ssPrice} / 10^9 / 10^3$ |
| Holging V(x) | $(x + 1/x) / 2$ |
| Holging 盈亏 | $(x - 1)^2 / (2x)$ |
| 金库比率 | $\text{vault} \times 10{,}000 / \text{obligations}$ |
| 提取下限 | $\text{obligations} \times 11{,}000 / 10{,}000$ |
| 置信度 | $\text{conf} \times 100 / \text{price} < 2\%$ |
| 偏差 | $|\Delta| \times 10{,}000 / \text{cached} \leq 1{,}500$ |
