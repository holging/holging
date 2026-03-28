# Holging — Tokenized Inverse Exposure on Solana

Holging lets you short SOL with a single click. Deposit USDC, receive **shortSOL** — an SPL token whose price moves inversely to SOL using a multiplicative (1/x) model with zero volatility decay, zero path dependency, and zero liquidation risk.

**Live demo:** [solshort.netlify.app](https://solshort.netlify.app)
**Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
**Network:** Solana Devnet

## How It Works

```
shortSOL_price = k / SOL_price
```

- SOL goes up → shortSOL goes down
- SOL goes down → shortSOL goes up
- No margin, no liquidation, no expiration
- Token lives in your regular wallet

### Holging Strategy (Hold + Hedge)

A 50/50 portfolio of SOL + shortSOL is **mathematically guaranteed to be profitable** in any direction (before fees), by the AM-GM inequality:

```
P&L = (x - 1)² / (2x)    where x = SOL price multiplier
```

| SOL Move | Holging P&L | On $10,000 |
|----------|-------------|------------|
| −50%     | +25.0%      | +$2,500    |
| −25%     | +4.2%       | +$417      |
| 0%       | 0.0%        | $0         |
| +25%     | +2.5%       | +$250      |
| +50%     | +8.3%       | +$833      |
| +100%    | +25.0%      | +$2,500    |

Break-even: SOL moves ±4% (to cover 0.08% roundtrip fee).

## Architecture

```
┌─────────────────────────────────────────┐
│  Frontend (React 19 + Vite 7)           │
│  ├── Mint / Redeem forms                │
│  ├── Strategy Terminal (V-curve chart)  │
│  ├── Token Holders view                 │
│  ├── State (public vault health)        │
│  └── Risk Dashboard (admin)             │
├─────────────────────────────────────────┤
│  Pyth Network (pull oracle, 400ms)      │
├─────────────────────────────────────────┤
│  Solana Program (Anchor 0.32.1, Rust)   │
│  User instructions                      │
│  ├── mint               — USDC → shortSOL │
│  ├── redeem             — shortSOL → USDC │
│  ├── update_price       — refresh oracle  │
│  LP instructions (permissionless)       │
│  ├── add_liquidity      — deposit USDC    │
│  ├── remove_liquidity   — withdraw USDC   │
│  ├── claim_lp_fees      — claim earned fees│
│  Admin instructions                     │
│  ├── initialize         — pool setup      │
│  ├── initialize_lp      — create LP mint  │
│  ├── migrate_pool       — realloc state   │
│  ├── withdraw_fees      — protocol fees   │
│  ├── update_k           — recalibrate k   │
│  ├── update_fee         — adjust fee bps  │
│  ├── update_min_lp_deposit — LP threshold │
│  ├── set_pause          — emergency halt  │
│  ├── create_metadata    — SPL metadata    │
│  ├── transfer_authority — propose handoff │
│  ├── accept_authority   — confirm handoff │
│  Funding Rate                           │
│  ├── initialize_funding — setup k-decay  │
│  ├── accrue_funding     — apply decay    │
│  └── update_funding_rate — change rate   │
└─────────────────────────────────────────┘
```

## Oracle Security (4-layer validation)

1. **Staleness** — price not older than 120s (devnet) / 30s (mainnet)
2. **Confidence** — CI < 2% of price
3. **Deviation** — change vs cached price < 15%
4. **Floor** — SOL price > $1.00

## Funding Rate

The protocol charges a continuous **k-decay** funding rate to compensate the vault for holding collateral:

```
k_new = k_old × (denom − rate_bps × elapsed_secs) / denom
where denom = SECS_PER_DAY × 10,000
```

- Default rate: **10 bps/day** (~30.6% compound/year)
- Max rate: **100 bps/day** (~97% compound/year)
- Applied automatically on every mint/redeem (inline, no keeper dependency)
- Hard cap: max **30 days** per `accrue_funding` call — prevents k→0 from keeper downtime
- Permissionless keeper: `scripts/keeper.ts` calls `accrue_funding` periodically

### Two-Step Authority Transfer

Admin key handoff is atomic and safe:
1. `transfer_authority` — current admin proposes a new authority (stores `pending_authority`)
2. `accept_authority` — new authority signs to confirm; previous key is invalidated

## LP System

Permissionless liquidity provision with pro-rata fee distribution:

- **add_liquidity** — deposit USDC, receive LP tokens (ERC4626-style shares)
- **remove_liquidity** — burn LP tokens, withdraw proportional USDC principal
- **claim_lp_fees** — collect accumulated trading fees (fee-per-share accumulator, 1e12 precision)

LP providers earn fees from every mint/redeem operation and from funding rate distributions. Minimum deposit: $100 USDC (configurable via `update_min_lp_deposit`).

## Circuit Breaker

Auto-pauses the pool if vault coverage drops below 95% of obligations. Protects users from bank runs during extreme SOL price drops.

Admin withdrawals (`remove_liquidity`, `withdraw_fees`) are limited to keep vault at ≥110% of obligations — providing a 15% buffer before the circuit breaker triggers.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Solana (400ms finality, $0.001/tx) |
| Smart Contract | Anchor 0.32.1 (Rust) |
| Oracle | Pyth Network (pull-based) |
| Frontend | React 19 + TypeScript 5.9 + Vite 7 |
| Wallet | Solana Wallet Adapter (Phantom, Solflare) |
| Token | SPL Token + Metaplex metadata |
| Hosting | Netlify |

## Getting Started

### Prerequisites

- Rust + Solana CLI + Anchor CLI
- Node.js >= 20
- Phantom or Solflare wallet (set to Devnet)

### Build & Deploy

```bash
# Build the program
anchor build

# Deploy to devnet
anchor deploy

# Initialize pool (requires scripts/)
npx ts-node scripts/initialize-pool.ts

# (Optional) Initialize funding rate — 10 bps/day k-decay
npx ts-node scripts/initialize-pool.ts  # sets up FundingConfig

# Run funding keeper (calls accrue_funding every hour)
npx ts-node scripts/keeper.ts
```

### Run Frontend

```bash
cd app
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173), connect wallet, and mint shortSOL.

## Key Differences vs Competitors

| | Holging | Perp DEX (Drift, Jupiter) | Leveraged Tokens |
|---|---------|--------------------------|-----------------|
| Margin/Liquidation | None | Yes | Partial |
| Volatility Decay | None | None (funding) | Yes |
| Slippage | 0% | Depth-dependent | Varies |
| Roundtrip Fee | 0.08% | 0.1–0.3% | 0.3–1% |
| Composability | SPL token | Position | ERC20/SPL |
| Expiration | None | None | None |

## Project Structure

```
programs/solshort/src/
  ├── lib.rs              — program entry
  ├── state.rs            — PoolState + FundingConfig accounts
  ├── constants.rs        — math constants, oracle config
  ├── oracle.rs           — Pyth price validation
  ├── fees.rs             — dynamic fee calculation
  ├── errors.rs           — 20 error codes
  ├── events.rs           — 16 event types
  └── instructions/       — 20 instruction handlers

app/src/
  ├── components/         — React UI components
  ├── hooks/              — usePool, usePythPrice, useSolshort
  ├── utils/              — math, PDA derivation, Pyth helpers
  └── idl/                — Anchor IDL
```

## License

MIT
