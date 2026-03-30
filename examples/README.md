# Holging Agent Examples

Ready-to-run examples for integrating with the Holging Transaction Builder API.

## TypeScript

```bash
npm install @solana/web3.js
npx ts-node examples/agent-typescript.ts
```

## Python

```bash
pip install solders solana requests
python examples/agent-python.py
```

## What They Do

Both examples run the same 8-step cycle:

1. **Claim USDC** — get 5,000 devnet USDC from faucet
2. **Market scan** — fetch all 4 pool prices
3. **Check position** — wallet balances (SOL, USDC, shortSOL)
4. **Simulate mint** — preview: 100 USDC → ? shortSOL
5. **Mint** — build tx → sign locally → submit to Solana
6. **Verify** — check position after mint
7. **Redeem** — build tx → sign locally → submit to Solana
8. **Final check** — confirm USDC returned

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOLGING_API` | `https://api.holging.com` | API base URL |
| `RPC_URL` | `https://api.devnet.solana.com` | Solana RPC |
| `WALLET_PATH` | `./wallet.json` | Path to keypair JSON |

## API Reference

See [mcp-server/README.md](../mcp-server/README.md) for full API documentation.
