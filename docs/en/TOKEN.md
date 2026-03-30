# shortSOL — Inverse SOL Token

> An inverse exposure token to SOL. The shortSOL price rises when SOL falls.

---

## Overview

| Parameter | Value |
|----------|----------|
| **Full Name** | shortSOL |
| **Type** | SPL Token (Solana) |
| **Mint** | `8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2` |
| **Decimals** | 9 |
| **Freeze Authority** | None (cannot be frozen) |
| **Mint Authority** | PDA `7gBZeefuxo4RcYAZitTzT414KFGvhUSC5XRtWy1sEB7q` (program only) |
| **Network** | Solana Devnet |
| **Protocol** | Holging |
| **Pool ID** | `sol` |

---

## Pricing Formula

```
shortSOL_price = k / SOL_price
```

| Parameter | Value | Description |
|----------|----------|----------|
| **k** | 7,197,715,091,917 | Normalizing constant, sets the initial price |
| **Precision** | 1e9 | All prices scaled to 9 decimal places |
| **P₀** | $84.84 | Initial SOL price at pool launch |
| **shortSOL₀** | $84.84 | Initial shortSOL price = P₀ |

### How It Works

```
SOL = $100  →  shortSOL = 7197715091917 × 1e9 / (100 × 1e9) = $71.98
SOL = $50   →  shortSOL = 7197715091917 × 1e9 / (50 × 1e9)  = $143.95
SOL = $170  →  shortSOL = 7197715091917 × 1e9 / (170 × 1e9) = $42.34
```

- SOL goes up → shortSOL goes down
- SOL goes down → shortSOL goes up
- The relationship is **multiplicative** (1/x), not additive (-x)
- **No volatility decay** — the price depends ONLY on the current SOL price
- **No path dependency** — it doesn't matter how the price reached the point

---

## Current State

| Metric | Value |
|---------|----------|
| **SOL/USD** | $83.98 |
| **shortSOL/USD** | $85.71 |
| **In Circulation** | 20.3492 shortSOL |
| **Total Minted** | 935.7642 shortSOL |
| **Total Redeemed** | 915.4150 shortSOL |
| **Vault Balance** | $111,638.59 USDC |
| **Fees Collected** | $57.56 |
| **Status** | ✅ Active |

---

## On-chain Addresses

| Account | Address | Description |
|---------|-------|----------|
| **Program** | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` | Holging smart contract |
| **Pool State** | `BXWhFrt39ruEpaWANuzTnb4JtPAzfsVgE2Y1dqfBhSnh` | PDA account of the SOL pool |
| **shortSOL Mint** | `8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2` | SPL Token mint |
| **Mint Authority** | `7gBZeefuxo4RcYAZitTzT414KFGvhUSC5XRtWy1sEB7q` | PDA — only the program can mint |
| **USDC Vault** | `AQ3vTfWBHBY2gPdc5SSK7M33RN5waN6ByPKwMdhtnEr1` | USDC storage |
| **USDC Mint** | `CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn` | Devnet USDC |
| **Funding Config** | `9L2FBc5HU2t475n2gRroj3TKzENpikeghLiSsoHZHvDf` | Funding rate configuration |
| **LP Mint** | `8oWELKc9GL3eYhC7YLbvvttNBKL6DskBB1GCiDSuKLNY` | LP tokens for liquidity providers |
| **Authority** | `66HBrTxNii7eFzSTgo8mUzsij3FM7xC2L9jE2H89sDYs` | Admin wallet |

### Pyth Oracle

| Parameter | Value |
|----------|----------|
| **Feed** | SOL/USD |
| **Feed ID** | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| **Latency** | ~400ms (pull-based) |
| **Staleness limit** | 259,200 sec (3 days, devnet) / 30 sec (mainnet) |

---

## Operations

### Mint (buying shortSOL)

```
User → USDC → Protocol → shortSOL

Example: 100 USDC → ~1.17 shortSOL (at SOL = $84)
  - Fee: 0.04% = $0.04
  - To vault: +$99.96
  - Tokens sent to wallet
```

### Redeem (redeeming shortSOL)

```
User → shortSOL → Protocol → USDC

Example: 1.0 shortSOL → ~$85.67 USDC (at SOL = $84)
  - Fee: 0.04% = $0.03
  - From vault: -$85.67
```

### Slippage Protection

All mint/redeem transactions include `min_tokens_out` / `min_usdc_out` — if the price moves beyond the allowed threshold, the transaction is reverted. Default: 1%.

---

## Fees

| Parameter | Value |
|----------|----------|
| **Base fee** | 4 bps (0.04%) |
| **Dynamic fee** | 4–20 bps (depends on vault health) |
| **Roundtrip** | 0.08% (mint + redeem) |
| **Fee distribution** | To vault → LP providers |

### Dynamic Fee Scale

| Vault Coverage | Fee |
|---------------|-----|
| > 200% | 0.04% (base) |
| 100–200% | 0.08% (2x) |
| < 100% | 0.20% (5x) |

---

## Funding Rate

| Parameter | Value |
|----------|----------|
| **Rate** | 10 bps/day (~30.6%/year) |
| **Mechanism** | k-decay — k decreases by 0.1% per day |
| **Application** | Inline during mint/redeem, no keeper dependency |
| **Purpose** | Compensating LP providers for holding risk |

---

## Security

### Circuit Breaker
- **Trigger**: vault coverage < 95%
- **Action**: automatic pause of all operations
- **Formula**: `coverage = vault_balance / (circulating × shortSOL_price)`
- **Current coverage**: ~6,400% (healthy)

### Oracle Validation (4 levels)
1. **Staleness**: price not older than 259,200 sec (devnet)
2. **Confidence**: Pyth confidence interval < 2%
3. **Deviation**: deviation from cache < 15% (mint/redeem)
4. **Floor**: SOL > $1.00

### Rate Limiting
- 2 seconds cooldown between operations from the same user
- Protection against sandwich attacks

---

## Holging Strategy

**50% SOL + 50% shortSOL = profit on any price movement**

```
P&L = (x − 1)² / (2x)    where x = SOL_price / SOL_price₀
```

By the AM-GM inequality: `V(x) = (x + 1/x) / 2 ≥ 1` for any x > 0.

| SOL Movement | Holging P&L | On $10,000 |
|-------------|-------------|------------|
| −50% | +25.0% | +$2,500 |
| −25% | +4.2% | +$417 |
| 0% | 0.0% | $0 |
| +25% | +2.5% | +$250 |
| +50% | +8.3% | +$833 |
| +100% | +25.0% | +$2,500 |

**Break-even**: SOL ±4% to cover the 0.08% roundtrip fee.

---

## Links

| Resource | URL |
|--------|-----|
| **Application** | https://holging.com |
| **GitHub** | https://github.com/holging/holging |
| **Solana Explorer (Mint)** | https://explorer.solana.com/address/8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2?cluster=devnet |
| **Solana Explorer (Program)** | https://explorer.solana.com/address/CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX?cluster=devnet |
| **Solana Explorer (Vault)** | https://explorer.solana.com/address/AQ3vTfWBHBY2gPdc5SSK7M33RN5waN6ByPKwMdhtnEr1?cluster=devnet |
| **Pyth SOL/USD** | https://pyth.network/price-feeds/crypto-sol-usd |
| **Math** | https://github.com/holging/docs/blob/main/math/MATH.md |
| **Lean 4 Proofs** | https://github.com/holging/holging/tree/main/lean-proofs |

---

*shortSOL — short SOL with one click. No margin, no liquidations, no expiration.*
