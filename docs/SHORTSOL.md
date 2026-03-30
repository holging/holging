# shortSOL — Inverse SOL Token

> Токен обратной экспозиции к SOL. Цена shortSOL растёт когда SOL падает.

---

## Обзор

| Параметр | Значение |
|----------|----------|
| **Полное имя** | shortSOL |
| **Тип** | SPL Token (Solana) |
| **Mint** | `8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2` |
| **Decimals** | 9 |
| **Freeze Authority** | None (невозможно заморозить) |
| **Mint Authority** | PDA `7gBZeefuxo4RcYAZitTzT414KFGvhUSC5XRtWy1sEB7q` (только программа) |
| **Сеть** | Solana Devnet |
| **Протокол** | Holging |
| **Pool ID** | `sol` |

---

## Формула ценообразования

```
shortSOL_price = k / SOL_price
```

| Параметр | Значение | Описание |
|----------|----------|----------|
| **k** | 7,197,715,091,917 | Нормализующая константа, задаёт начальную цену |
| **Precision** | 1e9 | Все цены масштабированы до 9 знаков |
| **P₀** | $84.84 | Начальная цена SOL при запуске пула |
| **shortSOL₀** | $84.84 | Начальная цена shortSOL = P₀ |

### Как работает

```
SOL = $100  →  shortSOL = 7197715091917 × 1e9 / (100 × 1e9) = $71.98
SOL = $50   →  shortSOL = 7197715091917 × 1e9 / (50 × 1e9)  = $143.95
SOL = $170  →  shortSOL = 7197715091917 × 1e9 / (170 × 1e9) = $42.34
```

- SOL растёт → shortSOL падает
- SOL падает → shortSOL растёт
- Зависимость **мультипликативная** (1/x), не аддитивная (-x)
- **Нет volatility decay** — цена зависит ТОЛЬКО от текущей цены SOL
- **Нет path dependency** — неважно как цена дошла до точки

---

## Текущее состояние

| Метрика | Значение |
|---------|----------|
| **SOL/USD** | $83.98 |
| **shortSOL/USD** | $85.71 |
| **В обращении** | 20.3492 shortSOL |
| **Всего заминтено** | 935.7642 shortSOL |
| **Всего погашено** | 915.4150 shortSOL |
| **Vault баланс** | $111,638.59 USDC |
| **Собрано комиссий** | $57.56 |
| **Статус** | ✅ Active |

---

## On-chain адреса

| Аккаунт | Адрес | Описание |
|---------|-------|----------|
| **Program** | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` | Holging smart contract |
| **Pool State** | `BXWhFrt39ruEpaWANuzTnb4JtPAzfsVgE2Y1dqfBhSnh` | PDA аккаунт пула SOL |
| **shortSOL Mint** | `8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2` | SPL Token mint |
| **Mint Authority** | `7gBZeefuxo4RcYAZitTzT414KFGvhUSC5XRtWy1sEB7q` | PDA — только программа может минтить |
| **USDC Vault** | `AQ3vTfWBHBY2gPdc5SSK7M33RN5waN6ByPKwMdhtnEr1` | Хранилище USDC |
| **USDC Mint** | `CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn` | Devnet USDC |
| **Funding Config** | `9L2FBc5HU2t475n2gRroj3TKzENpikeghLiSsoHZHvDf` | Конфигурация funding rate |
| **LP Mint** | `8oWELKc9GL3eYhC7YLbvvttNBKL6DskBB1GCiDSuKLNY` | LP токены для провайдеров ликвидности |
| **Authority** | `66HBrTxNii7eFzSTgo8mUzsij3FM7xC2L9jE2H89sDYs` | Admin кошелёк |

### Pyth Oracle

| Параметр | Значение |
|----------|----------|
| **Feed** | SOL/USD |
| **Feed ID** | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| **Latency** | ~400ms (pull-based) |
| **Staleness limit** | 259,200 sec (3 days, devnet) / 30 sec (mainnet) |

---

## Операции

### Mint (покупка shortSOL)

```
Пользователь → USDC → Протокол → shortSOL

Пример: 100 USDC → ~1.17 shortSOL (при SOL = $84)
  - Комиссия: 0.04% = $0.04
  - В vault: +$99.96
  - Токены отправлены на кошелёк
```

### Redeem (погашение shortSOL)

```
Пользователь → shortSOL → Протокол → USDC

Пример: 1.0 shortSOL → ~$85.67 USDC (при SOL = $84)
  - Комиссия: 0.04% = $0.03
  - Из vault: -$85.67
```

### Slippage Protection

Все mint/redeem транзакции включают `min_tokens_out` / `min_usdc_out` — если цена сдвинулась больше допустимого, транзакция откатывается. Default: 1%.

---

## Комиссии

| Параметр | Значение |
|----------|----------|
| **Base fee** | 4 bps (0.04%) |
| **Dynamic fee** | 4–20 bps (зависит от vault health) |
| **Roundtrip** | 0.08% (mint + redeem) |
| **Fee distribution** | В vault → LP провайдерам |

### Dynamic Fee Scale

| Vault Coverage | Fee |
|---------------|-----|
| > 200% | 0.04% (base) |
| 100–200% | 0.08% (2x) |
| < 100% | 0.20% (5x) |

---

## Funding Rate

| Параметр | Значение |
|----------|----------|
| **Rate** | 10 bps/day (~30.6%/year) |
| **Механизм** | k-decay — k уменьшается на 0.1% в день |
| **Применение** | Inline при mint/redeem, без зависимости от keeper |
| **Назначение** | Компенсация LP провайдерам за удержание риска |

---

## Безопасность

### Circuit Breaker
- **Триггер**: vault coverage < 95%
- **Действие**: автоматическая пауза всех операций
- **Формула**: `coverage = vault_balance / (circulating × shortSOL_price)`
- **Текущий coverage**: ~6,400% (здоровый)

### Oracle Validation (4 уровня)
1. **Staleness**: цена не старше 259,200 сек (devnet)
2. **Confidence**: доверительный интервал Pyth < 2%
3. **Deviation**: отклонение от кэша < 15% (mint/redeem)
4. **Floor**: SOL > $1.00

### Rate Limiting
- 2 секунды cooldown между операциями одного пользователя
- Защита от sandwich-атак

---

## Holging Strategy

**50% SOL + 50% shortSOL = прибыль при любом движении цены**

```
P&L = (x − 1)² / (2x)    где x = SOL_price / SOL_price₀
```

По неравенству AM-GM: `V(x) = (x + 1/x) / 2 ≥ 1` для любого x > 0.

| SOL движение | Holging P&L | На $10,000 |
|-------------|-------------|------------|
| −50% | +25.0% | +$2,500 |
| −25% | +4.2% | +$417 |
| 0% | 0.0% | $0 |
| +25% | +2.5% | +$250 |
| +50% | +8.3% | +$833 |
| +100% | +25.0% | +$2,500 |

**Break-even**: SOL ±4% для покрытия 0.08% roundtrip комиссии.

---

## Ссылки

| Ресурс | URL |
|--------|-----|
| **Приложение** | https://holging.com |
| **GitHub** | https://github.com/holging/holging |
| **Solana Explorer (Mint)** | https://explorer.solana.com/address/8FJjSQGMcxhmAWrBBTbVuoWzDn6LFFcJYD4RtR9VGJK2?cluster=devnet |
| **Solana Explorer (Program)** | https://explorer.solana.com/address/CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX?cluster=devnet |
| **Solana Explorer (Vault)** | https://explorer.solana.com/address/AQ3vTfWBHBY2gPdc5SSK7M33RN5waN6ByPKwMdhtnEr1?cluster=devnet |
| **Pyth SOL/USD** | https://pyth.network/price-feeds/crypto-sol-usd |
| **Математика** | https://github.com/holging/docs/blob/main/math/MATH.md |
| **Lean 4 Proofs** | https://github.com/holging/holging/tree/main/lean-proofs |

---

*shortSOL — шорт SOL одной кнопкой. Без маржи, без ликвидаций, без экспирации.*
