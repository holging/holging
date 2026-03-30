# Holging API — Конструктор транзакций для AI-агентов

> **Ваш агент подписывает. Мы строим. Приватные ключи не покидают вашу машину.**
>
> `https://api.holging.com`

Holging API строит неподписанные Solana-транзакции для вашего агента. Вы отправляете адрес кошелька и параметры — мы возвращаем base64-транзакцию готовую к подписи. Ваш приватный ключ никогда не покидает вашу машину.

---

## Как это работает

```
Ваш агент                           Holging API
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
  │  Агент подписывает СВОИМ ключом      │
  │  sendRawTransaction ──────────────>  Solana
```

---

## Базовый URL

```
https://api.holging.com
```

Сеть: Solana Devnet

---

## Эндпоинты

### Чтение (GET, бесплатно, без транзакций)

#### `GET /prices`

Цены всех 4 пулов одним вызовом.

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

Детальное состояние пула. ID: `sol`, `tsla`, `spy`, `aapl`.

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

Баланс кошелька для конкретного пула.

```bash
curl "https://api.holging.com/position?wallet=ВАШ_КЛЮЧ&pool=sol"
```

```json
{
  "wallet": "ВАШ_КЛЮЧ",
  "poolId": "sol",
  "sol": 3.57,
  "usdc": 5000.00,
  "shortSOL": 16.10
}
```

#### `GET /simulate/mint?amount=100&pool=sol`

Предпросмотр минта без исполнения.

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

Предпросмотр вывода без исполнения.

```bash
curl "https://api.holging.com/simulate/redeem?amount=1.5&pool=sol"
```

---

### Построение транзакций (POST, возвращает неподписанную tx)

Все POST-эндпоинты возвращают `{ tx: "base64...", ... }`. Декодируйте поле `tx`, подпишите своим ключом, отправьте через `sendRawTransaction`.

#### `POST /build/mint`

Построить неподписанную транзакцию минта (USDC → инверсные токены).

```bash
curl -X POST https://api.holging.com/build/mint \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "ВАШ_КЛЮЧ", "amount": 100, "pool": "sol" }'
```

```json
{
  "tx": "AQAAAAAAA...",
  "action": "mint",
  "expectedTokens": 1.1685,
  "fee": "$0.04",
  "message": "Подпишите и отправьте транзакцию для минта ~1.1685 shortSOL"
}
```

#### `POST /build/redeem`

Построить неподписанную транзакцию вывода (инверсные токены → USDC).

```bash
curl -X POST https://api.holging.com/build/redeem \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "ВАШ_КЛЮЧ", "amount": 1.5, "pool": "sol" }'
```

#### `POST /build/claim_usdc`

Построить неподписанную транзакцию получения 5,000 devnet USDC из крана.

```bash
curl -X POST https://api.holging.com/build/claim_usdc \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "ВАШ_КЛЮЧ" }'
```

#### `POST /build/add_liquidity`

Построить неподписанную транзакцию LP-депозита. Минимум $100 USDC.

```bash
curl -X POST https://api.holging.com/build/add_liquidity \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "ВАШ_КЛЮЧ", "amount": 500, "pool": "sol" }'
```

#### `POST /build/remove_liquidity`

Построить неподписанную транзакцию вывода LP.

```bash
curl -X POST https://api.holging.com/build/remove_liquidity \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "ВАШ_КЛЮЧ", "lp_shares": 1000000, "pool": "sol" }'
```

#### `POST /build/claim_lp_fees`

Построить неподписанную транзакцию сбора LP-комиссий.

```bash
curl -X POST https://api.holging.com/build/claim_lp_fees \
  -H "Content-Type: application/json" \
  -d '{ "wallet": "ВАШ_КЛЮЧ", "pool": "sol" }'
```

---

## Подпись и отправка транзакций

Каждый `/build/*` эндпоинт возвращает поле `tx` с base64-закодированной неподписанной Solana-транзакцией. Чтобы выполнить:

### TypeScript

```typescript
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json", "utf-8")))
);

// 1. Получить неподписанную tx от API
const res = await fetch("https://api.holging.com/build/mint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet: keypair.publicKey.toBase58(), amount: 100 }),
});
const { tx } = await res.json();

// 2. Декодировать и подписать локально
const transaction = Transaction.from(Buffer.from(tx, "base64"));
transaction.sign(keypair);

// 3. Отправить в Solana
const sig = await conn.sendRawTransaction(transaction.serialize());
await conn.confirmTransaction(sig, "confirmed");
console.log("Готово:", sig);
```

### Python

```python
import json, base64, requests
from solders.keypair import Keypair
from solana.rpc.api import Client
from solana.transaction import Transaction

client = Client("https://api.devnet.solana.com")
keypair = Keypair.from_json(open("wallet.json").read())

# 1. Получить неподписанную tx
resp = requests.post("https://api.holging.com/build/mint", json={
    "wallet": str(keypair.pubkey()), "amount": 100
})
tx_b64 = resp.json()["tx"]

# 2. Декодировать и подписать
tx = Transaction.deserialize(base64.b64decode(tx_b64))
tx.sign(keypair)

# 3. Отправить
result = client.send_raw_transaction(bytes(tx.serialize()))
print("Готово:", result.value)
```

---

## Пулы

| ID | Актив | Инверсный токен | Модель цены |
|----|-------|-----------------|-------------|
| `sol` | SOL | shortSOL | k / цена_SOL |
| `tsla` | TSLA | shortTSLA | k / цена_TSLA |
| `spy` | SPY | shortSPY | k / цена_SPY |
| `aapl` | AAPL | shortAAPL | k / цена_AAPL |

Когда актив растёт → инверсный токен падает (и наоборот).
Без маржи. Без ликвидации. Без экспирации.

---

## Лимиты

- 60 запросов в минуту на IP
- Burst: 20 запросов

---

## Ошибки

```json
{ "error": "Missing ?wallet=..." }
{ "error": "Need { wallet, amount, pool? }" }
{ "error": "Unknown pool: btc. Valid: sol, tsla, spy, aapl" }
```

---

## Ссылки

- **API**: https://api.holging.com
- **Фронтенд**: https://holging.com
- **GitHub**: https://github.com/holging/holging
- **Program ID**: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
