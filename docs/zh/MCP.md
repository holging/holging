# Holging MCP 服务器 — 工具参考

> **11 个 AI 代理工具**：读取、模拟、交易和管理 Holging 协议的流动性。

---

## 什么是 MCP

[Model Context Protocol](https://modelcontextprotocol.io)（MCP）是一个开放标准，允许 AI 助手调用外部工具。Holging MCP 服务器提供 11 个工具，使任何兼容 MCP 的代理（Claude、Cursor 等）都能完整访问 Solana 上的 Holging 协议。

---

## 快速配置

将以下内容添加到 `.mcp.json`（项目根目录）或 Claude Desktop 配置中：

```json
{
  "mcpServers": {
    "holging": {
      "command": "node",
      "args": ["<path>/mcp-server/dist/index.js"],
      "env": {
        "RPC_URL": "https://api.devnet.solana.com",
        "ANCHOR_WALLET": "<path>/solana-wallet.json",
        "USDC_MINT": "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn"
      }
    }
  }
}
```

首先构建服务器：

```bash
cd mcp-server && npm install && npm run build
```

---

## 支持的池

| Pool ID | 资产 | 反向代币 | Pyth Feed |
|---------|------|----------|-----------|
| `sol`   | SOL  | shortSOL | SOL/USD   |
| `tsla`  | TSLA | shortTSLA| TSLA/USD  |
| `spy`   | SPY  | shortSPY | SPY/USD   |
| `aapl`  | AAPL | shortAAPL| AAPL/USD  |

所有工具都接受可选的 `pool_id` 参数（默认值：`sol`）。

---

## 按类别分类的工具

### 📖 读取（4 个工具）

| 工具 | 描述 | 参数 |
|------|------|------|
| `get_pool_state` | Vault 余额、覆盖率、动态费率、LP 统计数据、铸造/赎回总量 | `pool_id` |
| `get_price` | Pyth 预言机实时价格 + 反向代币价格 + 置信区间 | `pool_id` |
| `get_all_prices` | 一次调用获取所有池的价格和状态 | — |
| `get_position` | 钱包余额：SOL、USDC、反向代币（美元价值）、LP 仓位 | `pool_id`、`wallet_address` |

### 🧪 模拟（2 个工具）

| 工具 | 描述 | 参数 |
|------|------|------|
| `simulate_mint` | 预览：USDC → 反向代币。显示预期输出和费用 | `usdc_amount`、`pool_id` |
| `simulate_redeem` | 预览：反向代币 → USDC。显示预期输出和费用 | `token_amount`、`pool_id` |

### 💱 交易（2 个工具）

| 工具 | 描述 | 参数 |
|------|------|------|
| `mint` | 存入 USDC，获得反向代币。更新 Pyth 预言机，2% 滑点保护 | `usdc_amount`、`pool_id` |
| `redeem` | 销毁反向代币，获得 USDC。更新 Pyth 预言机，2% 滑点保护 | `token_amount`、`pool_id` |

### 🏦 流动性提供者（3 个工具）

| 工具 | 描述 | 参数 |
|------|------|------|
| `add_liquidity` | 以 LP 身份存入 USDC。最低 $100。LP 份额与 vault 成比例 | `usdc_amount`、`pool_id` |
| `remove_liquidity` | 销毁 LP 份额，按比例提取 vault 中的 USDC | `lp_shares`、`pool_id` |
| `claim_lp_fees` | 将累计的交易费用领取到钱包 | `pool_id` |

---

## 工作流示例

### 市场扫描

```
→ get_all_prices
← SOL: $84.37 | shortSOL: $85.31
   TSLA: $178.50 | shortTSLA: $40.34
   SPY: $512.20 | shortSPY: $14.06
   AAPL: $195.80 | shortAAPL: $36.77
```

### Holging 入场（50/50 SOL + shortSOL）

```
→ get_pool_state { "pool_id": "sol" }          # 检查 vault 健康状态
← coverage: 6433%, fee: 0.04%, paused: false ✅

→ simulate_mint { "usdc_amount": 5000 }         # 预览交易
← 预期: 58.33 shortSOL, 费用: $2.00

→ mint { "usdc_amount": 5000 }                   # 执行
← ✅ tx: 3tAM59...

→ get_position { "pool_id": "sol" }              # 验证
← shortSOL: 58.33, 价值: $5,000
```

### LP 存款 + 领取费用

```
→ add_liquidity { "usdc_amount": 10000 }         # 作为 LP 存入
← ✅ LP shares: 9,950.00

→ claim_lp_fees { "pool_id": "sol" }             # 领取费用
← ✅ 已领取: $12.50 USDC
```

---

## 代理配置

自动化 Holging 的机器人配置示例：

```json
{
  "strategy": "holging",
  "pool_id": "sol",
  "capital_usdc": 10000,
  "rebalance_threshold_pct": 20,
  "check_interval_minutes": 60,
  "tools": {
    "scan": "get_all_prices",
    "health": "get_pool_state",
    "preview": "simulate_mint / simulate_redeem",
    "execute": "mint / redeem",
    "verify": "get_position"
  }
}
```

### 自动化循环

```
SCAN  → get_all_prices           (市场概览)
CHECK → get_pool_state           (vault 健康状态)
EVAL  → 比较入场价 vs 当前价     (±20% 阈值)
SIM   → simulate_mint/redeem     (预览交易)
EXEC  → mint / redeem            (链上交易)
VERIFY→ get_position             (确认余额)
WAIT  → 每小时重复
```

---

## 链接

- [Holging 策略指南](../en/HOLGING_STRATEGY.md)
- [shortSOL 代币规格](../en/SHORTSOL.md)
- [MCP 协议](https://modelcontextprotocol.io)
- [Pyth Network](https://pyth.network)

---

*11 个工具。4 个池。AI 代理的完整协议访问。*
