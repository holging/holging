# Holging — Tokenized Inverse Exposure on Solana

**Inverse ETF for Solana.** One token, one click, zero liquidations.

Deposit USDC → receive **shortSOL** — an SPL token whose price moves inversely to SOL. No margin, no liquidation, no expiration.

```
shortSOL_price = k / SOL_price
```

**Holging Strategy:** 50% SOL + 50% shortSOL = mathematically guaranteed profit from any price movement. Proven in Lean 4.

## Links

| | |
|---|---|
| 🌐 **App** | [holging.com](https://holging.com) |
| ⚡ **API** | [api.holging.com](https://api.holging.com) |
| 📦 **Program** | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` |
| 🔗 **Network** | Solana Devnet |

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API.md) | Transaction Builder API for AI agents |
| [Pitch](docs/PITCH.md) | Investor pitch |
| [Strategy Guide](docs/STRATEGY.md) | Holging strategy explained |
| [Token Spec](docs/TOKEN.md) | shortSOL token specification |
| [LP Guide](docs/LP.md) | Liquidity provider guide |
| [Mint Rules](docs/MINT_RULES.md) | Token minting specification |
| [Math](docs/MATH.md) | Mathematical architecture |
| [Security](docs/SECURITY.md) | Security audit report |
| [Vault](docs/VAULT.md) | Vault mechanics |
| [CPI Integration](docs/CPI.md) | Cross-program integration guide |
| [Mainnet Checklist](docs/MAINNET.md) | Mainnet readiness |
| [Protocol Spec](docs/SPEC.md) | Single source of truth for all protocol parameters |

## Agent Examples

```bash
# TypeScript
npx ts-node examples/agent-typescript.ts

# Python
python examples/agent-python.py
```

## Architecture

```
┌─────────────────────────────┐
│  Frontend (React + Vite)    │  holging.com
├─────────────────────────────┤
│  Transaction Builder API    │  api.holging.com
├─────────────────────────────┤
│  Pyth Network (oracle)      │  4 price feeds
├─────────────────────────────┤
│  Solana Program (Anchor)    │  20 instructions
│  Program ID: CLmSD9e...     │  2,931 lines Rust
└─────────────────────────────┘
```

## License

MIT
