# Holging MCP Server — AI Agent Trading on Solana

> **11 tools. 4 pools. One command.**
> Let your AI agent trade inverse tokens, provide liquidity, and run the Holging strategy on Solana.

```
shortSOL price = k / SOL price
SOL goes up → shortSOL goes down (and vice versa)
No margin. No liquidation. No expiration. Just a token in your wallet.
```

## Quick Start (30 seconds)

### 1. Clone & build

```bash
git clone https://github.com/holging/holging.git
cd holging/mcp-server
npm install && npm run build
```

### 2. Create a Solana wallet (if you don't have one)

```bash
solana-keygen new -o ~/holging-agent-wallet.json
solana config set --url devnet
solana airdrop 2 ~/holging-agent-wallet.json
```

### 3. Add to your AI tool

**Claude Code / Claude Desktop** — add to `.mcp.json`:

```json
{
  "mcpServers": {
    "holging": {
      "command": "node",
      "args": ["/path/to/holging/mcp-server/dist/index.js"],
      "env": {
        "RPC_URL": "https://api.devnet.solana.com",
        "ANCHOR_WALLET": "~/holging-agent-wallet.json",
        "USDC_MINT": "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn"
      }
    }
  }
}
```

**Cursor** — add the same block to `.cursor/mcp.json`.

### 4. Start trading

Tell your AI: *"Check all Holging prices and simulate minting 100 USDC of shortSOL"*

---

## Available Pools

| Pool | Asset | Inverse Token | What It Does |
|------|-------|---------------|-------------|
| `sol` | SOL | shortSOL | Profits when SOL drops |
| `tsla` | TSLA | shortTSLA | Profits when Tesla drops |
| `spy` | SPY | shortSPY | Profits when S&P 500 drops |
| `aapl` | AAPL | shortAAPL | Profits when Apple drops |

---

## All 11 Tools

### 📖 Read (no transaction, free)

| Tool | What It Does |
|------|-------------|
| `get_pool_state` | Vault balance, coverage ratio, fees, LP stats |
| `get_price` | Real-time Pyth oracle + inverse token price |
| `get_all_prices` | All 4 pools in one call — market scanner |
| `get_position` | Your wallet: SOL, USDC, tokens, LP shares |

### 🧪 Simulate (no transaction, free)

| Tool | What It Does |
|------|-------------|
| `simulate_mint` | Preview: USDC → tokens (shows fee + output) |
| `simulate_redeem` | Preview: tokens → USDC (shows fee + output) |

### ⚡ Trade (executes on-chain)

| Tool | What It Does |
|------|-------------|
| `mint` | Deposit USDC → receive inverse tokens |
| `redeem` | Burn inverse tokens → receive USDC |

### 💧 LP (liquidity provider)

| Tool | What It Does |
|------|-------------|
| `add_liquidity` | Deposit USDC → earn trading fees (min $100) |
| `remove_liquidity` | Withdraw USDC by burning LP shares |
| `claim_lp_fees` | Claim accumulated trading fees |

---

## Agent Strategies

### Strategy 1: Holging (Hold + Hedge) — Guaranteed Profit from Volatility

The core strategy. 50% SOL + 50% shortSOL. Math guarantees P&L ≥ 0 for any price move.

```
Agent workflow:
1. get_all_prices          → check SOL price
2. get_position            → check current SOL and shortSOL balances
3. Calculate ratio         → if shortSOL value / total < 40% or > 60%
4. simulate_mint or simulate_redeem → preview rebalance trade
5. mint or redeem          → execute rebalance
6. get_position            → verify new ratio ≈ 50/50
7. Repeat every 1-24 hours
```

**P&L table (per $10,000 portfolio):**

| SOL Move | Holging P&L | Dollar Profit |
|----------|-------------|---------------|
| -50% | +25.0% | +$2,500 |
| -25% | +4.2% | +$417 |
| +25% | +2.5% | +$250 |
| +50% | +8.3% | +$833 |
| +100% | +25.0% | +$2,500 |

Break-even: SOL moves ±4% (covers 0.08% roundtrip fee).

### Strategy 2: Momentum Short — Ride the Trend

```
Agent workflow:
1. get_all_prices          → scan all 4 assets
2. Track price over time   → if asset dropped >5% in 24h
3. simulate_mint           → preview short entry
4. mint                    → enter inverse position
5. Monitor with get_price  → check every hour
6. When asset recovers 3%  → simulate_redeem + redeem
7. get_position            → verify profit
```

### Strategy 3: LP Yield Farming — Earn Passive Fees

```
Agent workflow:
1. get_pool_state          → check vault health + coverage ratio
2. If coverage > 200%      → safe to provide liquidity
3. add_liquidity           → deposit USDC (min $100)
4. Monitor get_pool_state  → watch vault health daily
5. claim_lp_fees           → claim fees weekly
6. If coverage < 130%      → remove_liquidity (safety exit)
```

### Strategy 4: Multi-Asset Scanner — Find Best Short

```
Agent workflow:
1. get_all_prices          → get SOL, TSLA, SPY, AAPL prices
2. Compare to 24h ago      → which asset moved most?
3. Pick highest-momentum   → simulate_mint on that pool
4. mint                    → enter position
5. Set target: 5% profit   → monitor with get_price
6. redeem when target hit  → take profit
```

---

## Example Agent Session

```
Human: Scan the market and enter a holging position with $500

Agent:
→ get_all_prices
  SOL: $84.37 | shortSOL: $85.31 | coverage: 6,433%
  TSLA: $178.50 | shortTSLA: $40.34
  SPY: $512.20 | shortSPY: $14.06
  AAPL: $195.80 | shortAAPL: $36.77

SOL pool has the best coverage. Entering holging position on SOL.
Half goes to buying SOL on DEX, half to minting shortSOL.

→ simulate_mint { "usdc_amount": 250, "pool_id": "sol" }
  Expected: 2.92 shortSOL, fee: $0.10

→ mint { "usdc_amount": 250, "pool_id": "sol" }
  ✅ Minted 2.92 shortSOL | tx: 3tAM59...
  Explorer: https://solscan.io/tx/3tAM59...?cluster=devnet

→ get_position { "pool_id": "sol" }
  SOL: 1.48 ($125.00) | shortSOL: 2.92 ($249.90) | USDC: $9,750.10

Position entered. Portfolio: ~50% SOL exposure + ~50% inverse.
Holging P&L formula: (x-1)²/(2x) ≥ 0 — profit on any SOL move > ±4%.
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RPC_URL` | No | Solana RPC (default: `https://api.devnet.solana.com`) |
| `ANCHOR_WALLET` | Yes | Path to Solana keypair JSON |
| `USDC_MINT` | No | USDC mint address (default: devnet USDC) |

---

## Network

Currently deployed on **Solana Devnet**. All trades use devnet USDC (free).

- **Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
- **Live frontend:** [holging.com](https://holging.com)
- **GitHub:** [github.com/holging](https://github.com/holging)

---

## Architecture

```
Your AI Agent (Claude, GPT, Cursor, etc.)
    │
    │ MCP Protocol (stdio)
    ▼
┌─────────────────────────────┐
│  Holging MCP Server         │
│  11 tools, 4 pools          │
│  TypeScript + Anchor SDK    │
├─────────────────────────────┤
│  Pyth Network (oracle)      │
│  400ms price updates        │
│  SOL, TSLA, SPY, AAPL      │
├─────────────────────────────┤
│  Solana Blockchain          │
│  20 on-chain instructions   │
│  ~$0.001 per transaction    │
└─────────────────────────────┘
```

---

## FAQ

**Q: Is this real money?**
No. Devnet only. All USDC is test tokens. Use the faucet at [holging.com](https://holging.com) to get devnet USDC.

**Q: Can my agent lose money?**
On devnet — no (test tokens). The holging strategy (50/50 SOL + shortSOL) is mathematically guaranteed to profit from any price movement. Proven in Lean 4.

**Q: How fast are trades?**
~400ms confirmation on Solana. Costs ~$0.001 per transaction.

**Q: Can I run multiple agents?**
Yes. Each agent needs its own wallet keypair. All tools are stateless — no conflicts.

**Q: What's the minimum trade?**
Mint/redeem: any amount > 0 USDC. LP: minimum $100 USDC.

---

*Built for AI agents. Powered by Solana. Proven by math.*
