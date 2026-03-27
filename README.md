# SolShort — Tokenized Inverse Exposure on Solana

SolShort lets you short SOL with a single click. Deposit USDC, receive **shortSOL** — an SPL token whose price moves inversely to SOL using a multiplicative (1/x) model with zero volatility decay, zero path dependency, and zero liquidation risk.

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
│  ├── Risk Dashboard (admin)             │
│  └── Token Holders view                 │
├─────────────────────────────────────────┤
│  Pyth Network (pull oracle, 400ms)      │
├─────────────────────────────────────────┤
│  Solana Program (Anchor 0.32.1, Rust)   │
│  ├── initialize    — pool setup         │
│  ├── mint          — USDC → shortSOL    │
│  ├── redeem        — shortSOL → USDC    │
│  ├── update_price  — refresh oracle     │
│  ├── add_liquidity — vault topup        │
│  ├── update_k      — recalibrate        │
│  ├── set_pause     — emergency halt     │
│  └── create_metadata — SPL metadata     │
└─────────────────────────────────────────┘
```

## Oracle Security (4-layer validation)

1. **Staleness** — price not older than 120s (devnet) / 30s (mainnet)
2. **Confidence** — CI < 2% of price
3. **Deviation** — change vs cached price < 15%
4. **Floor** — SOL price > $1.00

## Circuit Breaker

Auto-pauses the pool if vault coverage drops below 95% of obligations. Protects users from bank runs during extreme SOL price drops.

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
```

### Run Frontend

```bash
cd app
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173), connect wallet, and mint shortSOL.

## Key Differences vs Competitors

| | SolShort | Perp DEX (Drift, Jupiter) | Leveraged Tokens |
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
  ├── state.rs            — PoolState account
  ├── constants.rs        — math constants, oracle config
  ├── oracle.rs           — Pyth price validation
  ├── fees.rs             — dynamic fee calculation
  ├── errors.rs           — 15 error codes
  ├── events.rs           — 7 event types
  └── instructions/       — 12 instruction handlers

app/src/
  ├── components/         — React UI components
  ├── hooks/              — usePool, usePythPrice, useSolshort
  ├── utils/              — math, PDA derivation, Pyth helpers
  └── idl/                — Anchor IDL
```

## License

MIT
