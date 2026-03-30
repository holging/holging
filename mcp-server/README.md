# Holging API — Transaction Builder for AI Agents

> **Your agent signs. We build. Zero key exposure.**
>
> `https://api.holging.com`

Holging API builds unsigned Solana transactions for your agent. You send a wallet address and parameters — we return a base64-encoded transaction ready to sign. Your private key never leaves your machine.

---

## How It Works

```
Your Agent                          Holging API
  │                                      │
  │  GET /prices                         │
  │─────────────────────────────────────>│
  │  { sol: $84, shortSOL: $85 }         │
  │<─────────────────────────────────────│
  │                                      │
  │  POST /build/mint                    │
  │  { wallet: "ABC...", amount: 100 }   │
  │─────────────────────────────────────>│
  │                                      │
  │  { tx: "base64...",                  │
  │    expectedTokens: 1.17 }            │
  │<─────────────────────────────────────│
  │                                      │
  │  Agent signs tx with own keypair     │
  │  sendRawTransaction ──────────────>  Solana
```

---

## Base URL

```
https://api.holging.com
```

Network: Solana Devnet

---

## Endpoints

### Read (GET, free, no transaction)

#### `GET /prices`

All 4 pools in one call.

```bash
curl https://api.holging.com/prices
```

```json
{
  "prices": {
    "sol":  { "asset": "SOL",  "assetPrice": 84.35, "token": "shortSOL",  "tokenPrice": 85.32, "vaultBalance": "$112638.59" },
    "tsla": { "asset": "TSLA", "assetPrice": 362.78, "token": "shortTSLA", "tokenPrice": 361.68, "vaultBalance": "$1200.00" },
    "spy":  { "asset": "SPY",  "assetPrice": 638.05, "token": "shortSPY",  "tokenPrice": 631.60, "vaultBalance": "$0.00" },
    "aapl": { "asset": "AAPL", "assetPrice": 246.94, "token": "shortAAPL", "tokenPrice": 250.56, "vaultBalance": "$0.00" }
  }
}
```

#### `GET /pool/:id`

Detailed pool state. IDs: `sol`, `tsla`, `spy`, `aapl`.

```bash
curl https://api.holging.com/pool/sol
```

```json
{
  "poolId": "sol",
  "asset": "SOL",
  "token": "shortSOL",
  "assetPrice": 84.35,
  "tokenPrice": 85.32,
  "feeBps": 4,
  "dynamicFeeBps": 4,
  "coverage": "4120.4%",
  "vaultBalance": 112638.59,
  "obligations": 2733.70,
  "paused": false,
  "lpTotalSupply": "10000000000",
  "lpPrincipal": 10000,
  "minLpDeposit": 100
}
```

#### `GET /position?wallet=...&pool=sol`

Wallet balances for a specific pool.

```bash
curl "https://api.holging.com/position?wallet=YOUR_PUBKEY&pool=sol"
```

```json
{
  "wallet": "YOUR_PUBKEY",
  "poolId": "sol",
  "sol": 3.57,
  "usdc": 5000.00,
  "shortSOL": 16.10
}
```

#### `GET /simulate/mint?amount=100&pool=sol`

Preview a mint without executing.

```bash
curl "https://api.holging.com/simulate/mint?amount=100&pool=sol"
```

```json
{
  "action": "mint",
  "usdcIn": 100,
  "expectedTokens": 1.1689,
  "fee": "$0.0400",
  "feeBps": 4,
  "assetPrice": 84.35,
  "tokenPrice": 85.32
}
```

#### `GET /simulate/redeem?amount=1.5&pool=sol`

Preview a redeem without executing.

```bash
curl "https://api.holging.com/simulate/redeem?amount=1.5&pool=sol"
```

---

### Build Transactions (POST, returns unsigned tx)

All POST endpoints return `{ tx: "base64...", ... }`. Decode the `tx` field, sign it with your keypair, and submit via `sendRawTransaction`.

#### `POST /build/mint`

Build an unsigned mint transaction (USDC → inverse tokens).

```bash
curl -X POST https://api.holging.com/build/mint \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "amount": 100, "pool": "sol" }'
```

```json
{
  "tx": "AQAAAAAAA...",
  "action": "mint",
  "expectedTokens": 1.1685,
  "fee": "$0.04",
  "message": "Sign and send this transaction to mint ~1.1685 shortSOL"
}
```

#### `POST /build/redeem`

Build an unsigned redeem transaction (inverse tokens → USDC).

```bash
curl -X POST https://api.holging.com/build/redeem \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "amount": 1.5, "pool": "sol" }'
```

#### `POST /build/claim_usdc`

Build an unsigned transaction to claim 5,000 devnet USDC from the faucet.

```bash
curl -X POST https://api.holging.com/build/claim_usdc \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY" }'
```

#### `POST /build/add_liquidity`

Build an unsigned LP deposit transaction. Minimum $100 USDC.

```bash
curl -X POST https://api.holging.com/build/add_liquidity \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "amount": 500, "pool": "sol" }'
```

#### `POST /build/remove_liquidity`

Build an unsigned LP withdrawal transaction.

```bash
curl -X POST https://api.holging.com/build/remove_liquidity \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "lp_shares": 1000000, "pool": "sol" }'
```

#### `POST /build/claim_lp_fees`

Build an unsigned LP fee claim transaction.

```bash
curl -X POST https://api.holging.com/build/claim_lp_fees \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "pool": "sol" }'
```

---

## Signing & Submitting Transactions

Every `/build/*` endpoint returns a `tx` field containing a base64-encoded unsigned Solana transaction. To execute it:

### TypeScript

```typescript
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf-8")))
);

// 1. Get unsigned tx from API
const res = await fetch("https://api.holging.com/build/mint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet: keypair.publicKey.toBase58(), amount: 100 }),
});
const { tx } = await res.json();

// 2. Decode and sign
const transaction = Transaction.from(Buffer.from(tx, "base64"));
transaction.sign(keypair);

// 3. Submit
const sig = await conn.sendRawTransaction(transaction.serialize());
await conn.confirmTransaction(sig, "confirmed");
console.log("Done:", sig);
```

### Python

```python
import json, base64, requests
from solders.keypair import Keypair
from solders.transaction import Transaction
from solana.rpc.api import Client

client = Client("https://api.devnet.solana.com")
keypair = Keypair.from_json(open("wallet.json").read())

# 1. Get unsigned tx
resp = requests.post("https://api.holging.com/build/mint", json={
    "wallet": str(keypair.pubkey()), "amount": 100
})
tx_b64 = resp.json()["tx"]

# 2. Decode and sign
tx_bytes = base64.b64decode(tx_b64)
tx = Transaction.from_bytes(tx_bytes)
signed = keypair.sign_message(tx.message_data())

# 3. Submit
result = client.send_raw_transaction(bytes(tx))
print("Done:", result.value)
```

---

## Pools

| ID | Asset | Inverse Token | Price Model |
|----|-------|---------------|-------------|
| `sol` | SOL | shortSOL | k / SOL_price |
| `tsla` | TSLA | shortTSLA | k / TSLA_price |
| `spy` | SPY | shortSPY | k / SPY_price |
| `aapl` | AAPL | shortAAPL | k / AAPL_price |

When asset goes up → inverse token goes down (and vice versa).
No margin. No liquidation. No expiration.

---

## Rate Limits

- 60 requests per minute per IP
- Burst: 20 requests

---

## Errors

```json
{ "error": "Missing ?wallet=..." }
{ "error": "Need { wallet, amount, pool? }" }
{ "error": "Unknown pool: btc. Valid: sol, tsla, spy, aapl" }
```

---

## Links

- **API**: https://api.holging.com
- **Frontend**: https://holging.com
- **GitHub**: https://github.com/holging/holging
- **Program ID**: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
