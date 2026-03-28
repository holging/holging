# SolShort — Investor Pitch

## One-liner
**Inverse ETF for Solana.** One token, one click, zero liquidations.

---

## Problem ($47B market)

To short SOL today you need:
- **CEX**: KYC, margin, funding rate, liquidation risk
- **Perp DEX** (Drift, Jupiter): complex, high barrier, position ≠ token
- **Leveraged inverse tokens** (Ethereum): volatility decay, path dependency

**There is no simple SPL token for inverse SOL exposure.**

---

## Solution

**shortSOL** — SPL token, price = k / SOL_price (multiplicative 1/x model)

- SOL goes up → shortSOL goes down (and vice versa)
- **Zero volatility decay** — unlike leveraged ETFs, no daily rebalancing
- **Zero path dependency** — price depends only on current SOL price, not history
- **Zero liquidation risk** — just a token in your wallet
- **Zero slippage** — trades at oracle price (Pyth Network)

---

## Holging Strategy (unique IP)

50% SOL + 50% shortSOL = **mathematically guaranteed profit** in any price direction

```
P&L = (x - 1)² / (2x) ≥ 0    for any x > 0
```

**8 theorems formally proven in Lean 4** — no DeFi protocol on Solana has machine-checked proofs. Equivalent to a "perpetual straddle without theta decay".

---

## Competitive Landscape

*Source: Colosseum Copilot, 5,400+ Solana projects analyzed*

| Project | Prizes | Approach | vs SolShort |
|---------|--------|----------|-------------|
| **Reflect Protocol** | Grand Prize $50K, Accelerator C2 | Delta-neutral via LST + perps | Complex, requires rebalancing |
| **Squeeze** | 1st DeFi $25K | Leveraged long/short via lending | Launchpad, not inverse token |
| **Exponent** | 5th DeFi $5K | Yield derivatives | Yield, not price exposure |
| **Hedge Fun** | Cypherpunk 2025 | Prediction market hedging | Not tokenized |
| **Solistic Finance** | Breakout 2025 | Synthetic assets (stocks, RWA) | Broad scope, not specialized |

**No project in 5,400+ implements a 1/x inverse token.** Reflect (closest competitor, $50K Grand Prize) uses complex delta-neutral strategy with perps and rebalancing. SolShort = one token, one formula, zero maintenance.

Paradigm Research confirms: "Everything Is A Perp" — the market is moving toward tokenized derivatives. Friktion (Superteam deep dive) proved demand for structured products on Solana, but shut down — the niche is open.

---

## Traction

- **16 instructions** deployed on Solana Devnet (16 error codes, 12 event types)
- **Dynamic fees** (5-50 bps based on vault health)
- **Funding rate** — k-decay 10 bps/day (~30.6%/year); applied inline on mint/redeem, no keeper dependency
- **Two-step authority transfer** — propose + accept pattern, atomic and safe
- **Withdrawal floor 110%** — admin cannot drain vault below 110% of obligations
- **Circuit breaker** (auto-pause at vault ratio < 95%)
- **4-layer oracle validation** (Pyth Network)
- **Vault reconciliation** (post-CPI balance verification)
- **Slippage protection** (1% default tolerance)
- **Rate limiting** (2s cooldown, anti-sandwich)
- **Live demo:** https://solshort.netlify.app
- **Formally verified** (Lean 4, 8 theorems)
- **Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

---

## Revenue Model

- **0.1% per side** (0.2% roundtrip) — dynamic, increases under stress
- At $1M daily volume → **$2,000/day = $730K/year**
- Fees stay in vault as safety buffer + withdrawable by admin

| Daily Volume | Annual Revenue | Break-even (on $500K seed) |
|-------------|----------------|---------------------------|
| $100K | $73K | 7 years |
| $500K | $365K | 16 months |
| $1M | $730K | 8 months |
| $5M | $3.65M | 2 months |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Solana (400ms finality, $0.001/tx) |
| Smart Contract | Anchor 0.32.1 (Rust), 16 instructions |
| Oracle | Pyth Network (pull-based, 400ms) |
| Frontend | React 19 + Vite 7 + TypeScript |
| Formal Verification | Lean 4 + Mathlib (8 theorems) |
| Keeper | Node.js (scripts/keeper.ts), permissionless |
| Hosting | Netlify |

---

## Roadmap

| Phase | Timeline | Milestones |
|-------|----------|------------|
| **Audit + Mainnet** | Q1 2026 | Security audit (OtterSec), Squads multisig, mainnet deployment |
| **Growth** | Q2 2026 | Jupiter aggregator, Orca AMM pool (SOL/shortSOL) |
| **Multi-Asset** | Q3 2026 | shortBTC, shortETH, shortGOLD |
| **Automation** | Q4 2026 | Holging Vault (automatic 50/50 portfolio), governance token |

---

## Ask

**$500K seed round** allocation:

| Category | Amount | Purpose |
|----------|--------|---------|
| Security Audit | $50K | OtterSec / Neodyme |
| Vault Liquidity | $200K | Initial overcollateralization |
| Team (6 months) | $200K | 2 engineers |
| Legal + Compliance | $50K | Regulatory framework |

---

## Why Now

- Solana DeFi TVL growing, but hedging infrastructure lags behind
- Friktion shut down — structured products niche is empty
- Reflect proved demand ($50K Grand Prize) — but too complex for retail
- SolShort = **"ProShares Short S&P 500" for crypto — simplicity wins**

---

## Q&A

### Product

**Q: Why not just sell SOL?**
Selling SOL = exiting the ecosystem. shortSOL = hedge inside the ecosystem. Holging (50% SOL + 50% shortSOL) lets you profit from volatility while staying exposed. shortSOL is a composable SPL token — usable in LP, farming, DeFi strategies.

**Q: How is this better than Drift/Jupiter perps?**
Different audiences. Perps = traders (margin, funding rate, liquidation monitoring). SolShort = holders (one click, token in wallet, zero maintenance). Analogy: ProShares Short S&P 500 (ETF) vs E-mini S&P futures.

**Q: "Holging always wins" — isn't that too good to be true?**
Mathematically proven in Lean 4 (8 theorems). Economically — break-even at SOL ±4% (0.2% roundtrip fee). For daily moves of 1-2%, profit ≈ zero. The strategy profits from **volatility** — bigger moves = bigger P&L. It's a perpetual straddle without theta decay.

**Q: What if SOL drops 80%?**
shortSOL rises 5x. Vault must pay 5x. Circuit breaker pauses at vault ratio < 95%. Solution: overcollateralization. Formula: for -80% protection, vault = 5x TVL. Dynamic fees automatically increase to 0.5% under stress, slowing outflows.

### Economics

**Q: Who is the counterparty?**
Vault is treasury-backed. Initially overcollateralized by team/fund. Fees (0.1-0.5%) accumulate as safety buffer. At high volume, vault becomes self-sustaining. V2: external LPs with yield sharing.

**Q: How is the liquidity pool funded?**
Via `add_liquidity` instruction (admin-only). Initially: seed capital from fund. V2: permissionless LP vault with yield sharing from fees. V3: AMM pool on Orca (SOL/shortSOL).

**Q: Why not block mint when vault ratio is low?**
Mint **replenishes** the vault (user deposits USDC). Blocking mint = blocking liquidity inflow. Instead, dynamic fees make mint **cheaper** at low ratio, incentivizing deposits.

### Security

**Q: What about audit?**
Devnet MVP. Audit planned before mainnet (OtterSec/Neodyme, $50K budget). Current protections: checked arithmetic everywhere, 4-layer oracle validation, circuit breaker, rate limiting, vault reconciliation, slippage protection, dynamic fees, funding rate, two-step authority transfer, 16 error codes.

**Q: Oracle manipulation?**
Pyth Network pull-based, 400ms. 4-layer validation: staleness (120s), confidence (<2%), deviation (<15% mint/redeem, <50% update_price), floor ($1). Rate limiting (2s cooldown) prevents sandwich attacks. `update_price` does not reset rate limit timer.

**Q: Single admin key?**
Two-step `transfer_authority` + `accept_authority` already implemented — new key must sign to confirm. Squads v4 multisig integration planned for Q1 2026 before mainnet.

**Q: Circuit breaker pauses when users need to redeem most?**
Circuit breaker protects against bank runs — without it, first redeemer takes all, others get nothing. Like FDIC insurance — limits withdrawal to protect everyone. Solution: deeper overcollateralization (vault ≥ 200-500% obligations).

### Technology

**Q: Why Lean 4 for formal verification?**
Lean 4 is the industry standard for machine-checked proofs (used by Microsoft, AWS). 8 theorems prove holging P&L ≥ 0, pricing invariant, positive gamma. No DeFi protocol on Solana has published formal proofs. Competitive advantage for audit and investor confidence.

**Q: Does the architecture scale to multi-asset?**
Yes. `pool_id` is parameterized across all 16 instructions. For shortBTC: new Pyth feed + frontend pool selector. Architecture ready, code changes = 1 day.

### Market

**Q: Squeeth (Ethereum inverse ETF) shut down — why will you succeed?**
Squeeth used x² model (leveraged, path-dependent). SolShort uses 1/x (no decay, no path dependency). Squeeth required complex infrastructure and deep liquidity. SolShort is vault-backed, zero slippage, simpler model. Different products for different markets.

**Q: TAM/SAM/SOM?**
TAM: $47B (crypto derivatives daily volume). SAM: $2B (Solana perps volume). SOM: $50M (1-year target, retail hedging + holging). At 0.2% fee capture = $100K/year at $50M volume.
