# Holging API — 为 AI 代理构建交易

> **您的代理签名。我们构建交易。密钥零暴露。**
>
> `https://api.holging.com`

Holging API 为您的代理构建未签名的 Solana 交易。您发送钱包地址和参数 — 我们返回一个 base64 编码的交易，随时可签名。您的私钥永远不会离开您的机器。

---

## 工作原理

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

## 基础 URL

```
https://api.holging.com
```

网络：Solana Devnet

---

## 接口列表

### 读取接口（GET，免费，无需交易）

#### `GET /prices`

一次调用返回全部 4 个资金池信息。

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

详细的资金池状态。可用 ID：`sol`、`tsla`、`spy`、`aapl`。

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

查询指定资金池的钱包余额。

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

预览铸造操作，不实际执行。

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

预览赎回操作，不实际执行。

```bash
curl "https://api.holging.com/simulate/redeem?amount=1.5&pool=sol"
```

---

### 构建交易（POST，返回未签名交易）

所有 POST 接口返回 `{ tx: "base64...", ... }`。解码 `tx` 字段，使用您的密钥对签名，然后通过 `sendRawTransaction` 提交。

#### `POST /build/mint`

构建未签名的铸造交易（USDC → 反向代币）。

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

构建未签名的赎回交易（反向代币 → USDC）。

```bash
curl -X POST https://api.holging.com/build/redeem \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "amount": 1.5, "pool": "sol" }'
```

#### `POST /build/claim_usdc`

构建未签名的交易，从水龙头领取 5,000 devnet USDC。

```bash
curl -X POST https://api.holging.com/build/claim_usdc \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY" }'
```

#### `POST /build/add_liquidity`

构建未签名的 LP 存入交易。最低 $100 USDC。

```bash
curl -X POST https://api.holging.com/build/add_liquidity \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "amount": 500, "pool": "sol" }'
```

#### `POST /build/remove_liquidity`

构建未签名的 LP 提取交易。

```bash
curl -X POST https://api.holging.com/build/remove_liquidity \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "lp_shares": 1000000, "pool": "sol" }'
```

#### `POST /build/claim_lp_fees`

构建未签名的 LP 手续费领取交易。

```bash
curl -X POST https://api.holging.com/build/claim_lp_fees \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "YOUR_PUBKEY", "pool": "sol" }'
```

---

## 签名与提交交易

每个 `/build/*` 接口都返回一个 `tx` 字段，包含 base64 编码的未签名 Solana 交易。执行步骤如下：

### TypeScript

```typescript
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf-8")))
);

// 1. 从 API 获取未签名交易
const res = await fetch("https://api.holging.com/build/mint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet: keypair.publicKey.toBase58(), amount: 100 }),
});
const { tx } = await res.json();

// 2. 解码并签名
const transaction = Transaction.from(Buffer.from(tx, "base64"));
transaction.sign(keypair);

// 3. 提交
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

# 1. 获取未签名交易
resp = requests.post("https://api.holging.com/build/mint", json={
    "wallet": str(keypair.pubkey()), "amount": 100
})
tx_b64 = resp.json()["tx"]

# 2. 解码并签名
tx_bytes = base64.b64decode(tx_b64)
tx = Transaction.from_bytes(tx_bytes)
signed = keypair.sign_message(tx.message_data())

# 3. 提交
result = client.send_raw_transaction(bytes(tx))
print("Done:", result.value)
```

---

## 资金池

| ID | 资产 | 反向代币 | 定价模型 |
|----|------|----------|----------|
| `sol` | SOL | shortSOL | k / SOL_price |
| `tsla` | TSLA | shortTSLA | k / TSLA_price |
| `spy` | SPY | shortSPY | k / SPY_price |
| `aapl` | AAPL | shortAAPL | k / AAPL_price |

当资产价格上涨 → 反向代币价格下跌（反之亦然）。
无保证金。无清算。无到期日。

---

## 速率限制

- 每个 IP 每分钟 60 次请求
- 突发：20 次请求

---

## 错误处理

```json
{ "error": "Missing ?wallet=..." }
{ "error": "Need { wallet, amount, pool? }" }
{ "error": "Unknown pool: btc. Valid: sol, tsla, spy, aapl" }
```

---

## 链接

- **API**：https://api.holging.com
- **前端**：https://holging.com
- **GitHub**：https://github.com/holging/holging
- **Program ID**：`CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

---

🇬🇧 [English documentation](../en/API.md) · 🇷🇺 [Документация на русском](../ru/API.md)
