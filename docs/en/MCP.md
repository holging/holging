# Holging MCP Server — Tool Reference

> **11 tools for AI agents** to read, simulate, trade, and manage liquidity on the Holging protocol.

---

## What is MCP

[Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open standard that lets AI assistants call external tools. The Holging MCP server exposes 11 tools that give any MCP-compatible agent (Claude, Cursor, etc.) full access to the Holging protocol on Solana.

---

## Quick Setup

Add to your `.mcp.json` (project root) or Claude Desktop config:

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

Build the server first:

```bash
cd mcp-server && npm install && npm run build
```

---

## Supported Pools

| Pool ID | Asset | Inverse Token | Pyth Feed |
|---------|-------|---------------|-----------|
| `sol`   | SOL   | shortSOL      | SOL/USD   |
| `tsla`  | TSLA  | shortTSLA     | TSLA/USD  |
| `spy`   | SPY   | shortSPY      | SPY/USD   |
| `aapl`  | AAPL  | shortAAPL     | AAPL/USD  |

All tools accept an optional `pool_id` parameter (default: `sol`).

---

## Tools by Category

### 📖 Read (4 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_pool_state` | Vault balance, coverage ratio, dynamic fee, LP stats, mint/redeem totals | `pool_id` |
| `get_price` | Real-time Pyth oracle price + inverse token price + confidence | `pool_id` |
| `get_all_prices` | Prices and status for ALL pools in one call | — |
| `get_position` | Wallet balances: SOL, USDC, inverse tokens (USD value), LP position | `pool_id`, `wallet_address` |

### 🧪 Simulate (2 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `simulate_mint` | Preview: USDC → inverse tokens. Shows expected output and fee | `usdc_amount`, `pool_id` |
| `simulate_redeem` | Preview: inverse tokens → USDC. Shows expected output and fee | `token_amount`, `pool_id` |

### 💱 Trade (2 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `mint` | Deposit USDC, receive inverse tokens. Posts Pyth update, 2% slippage protection | `usdc_amount`, `pool_id` |
| `redeem` | Burn inverse tokens, receive USDC. Posts Pyth update, 2% slippage protection | `token_amount`, `pool_id` |

### 🏦 Liquidity Provider (3 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `add_liquidity` | Deposit USDC as LP. Minimum $100. Receive LP shares proportional to vault | `usdc_amount`, `pool_id` |
| `remove_liquidity` | Burn LP shares, withdraw proportional USDC from vault | `lp_shares`, `pool_id` |
| `claim_lp_fees` | Claim accumulated trading fees to wallet | `pool_id` |

---

## Example Workflows

### Market Scan

```
→ get_all_prices
← SOL: $84.37 | shortSOL: $85.31
   TSLA: $178.50 | shortTSLA: $40.34
   SPY: $512.20 | shortSPY: $14.06
   AAPL: $195.80 | shortAAPL: $36.77
```

### Holging Entry (50/50 SOL + shortSOL)

```
→ get_pool_state { "pool_id": "sol" }          # Check vault health
← coverage: 6433%, fee: 0.04%, paused: false ✅

→ simulate_mint { "usdc_amount": 5000 }         # Preview trade
← expect: 58.33 shortSOL, fee: $2.00

→ mint { "usdc_amount": 5000 }                   # Execute
← ✅ tx: 3tAM59...

→ get_position { "pool_id": "sol" }              # Verify
← shortSOL: 58.33, value: $5,000
```

### LP Deposit + Fee Claim

```
→ add_liquidity { "usdc_amount": 10000 }         # Deposit as LP
← ✅ LP shares: 9,950.00

→ claim_lp_fees { "pool_id": "sol" }             # Claim fees later
← ✅ claimed: $12.50 USDC
```

---

## Agent Configuration

Example bot config for automated Holging:

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

### Automated Cycle

```
SCAN  → get_all_prices           (market overview)
CHECK → get_pool_state           (vault health)
EVAL  → compare entry vs current (±20% threshold)
SIM   → simulate_mint/redeem     (preview trade)
EXEC  → mint / redeem            (on-chain tx)
VERIFY→ get_position             (confirm balances)
WAIT  → repeat every 1 hour
```

---

## Links

- [Holging Strategy Guide](./HOLGING_STRATEGY.md)
- [shortSOL Token Spec](./SHORTSOL.md)
- [MCP Protocol](https://modelcontextprotocol.io)
- [Pyth Network](https://pyth.network)

---

*11 tools. 4 pools. Full protocol access for AI agents.*
