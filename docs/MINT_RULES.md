# Mint — Правила минта токена

> Полное описание процесса создания inverse-токена в протоколе Holging.

---

## Обзор

Mint — операция депозита USDC для получения inverse-токена (shortSOL, shortTSLA и т.д.).

```
Пользователь → USDC → Протокол → inverse token
```

**Ключевой принцип:** токены минтятся ТОЛЬКО программой, по формуле, на основе Pyth oracle цены. Никто — ни admin, ни пользователь — не может создать токены без обеспечения USDC в vault.

---

## Формула минта

```
1. shortsol_price = k × 1e9 / SOL_price

2. dynamic_fee = calc_dynamic_fee(base_fee, vault, circulating, k, price)

3. fee_amount = usdc_amount × dynamic_fee / 10000

4. effective_usdc = usdc_amount − fee_amount

5. tokens = effective_usdc × 1000 × 1e9 / shortsol_price
            ↑ scaling 1e6→1e9   ↑ PRICE_PRECISION
```

### Пример

```
Input:        100 USDC
SOL price:    $84.57
k:            7,197,715,091,917
shortSOL:     $85.11 (= k × 1e9 / 84,570,000,000)
Coverage:     6,446% (> 200%)
Dynamic fee:  2 bps (0.02%) — discounted

Fee:          100 × 2 / 10000 = $0.02
Effective:    $99.98
Tokens:       99.98 × 1000 × 1e9 / 85,110,000,000 = 1.1748 shortSOL

Output:       1.1748 shortSOL → кошелёк пользователя
Vault:        +$100 USDC
```

---

## Пошаговый процесс (on-chain)

### 1. Проверки перед минтом

| Проверка | Условие | Ошибка |
|----------|---------|--------|
| Пул не на паузе | `!pool.paused` | `Paused` |
| Сумма > 0 | `usdc_amount > 0` | `AmountTooSmall` |
| Rate limit | `>= 2 секунды с последней операции` | `RateLimitExceeded` |
| Funding config | Если существует — обязан быть передан | `FundingConfigRequired` |

### 2. Funding (если передан FundingConfig)

```
Перед расчётом цены применяется k-decay:
  elapsed = now − last_accrued
  periods = elapsed / 86400  (сколько дней прошло)
  k_new = k × (1 − rate_bps/10000)^periods

Funding уменьшает k → shortSOL дешевеет со временем.
Текущий rate: 10 bps/day = 0.1%/day ≈ 30.6%/year
```

### 3. Oracle валидация (4 уровня)

| Уровень | Параметр | Значение (devnet) | Описание |
|---------|----------|-------------------|----------|
| 1 | Staleness | 259,200 сек (3 дня) | Pyth price не старше N секунд |
| 2 | Confidence | < 2% | Доверительный интервал Pyth |
| 3 | Deviation | < 15% (1500 bps) | Отклонение от кэшированной цены |
| 4 | Floor | > $1.00 | Минимальная цена актива |

Если любая проверка не проходит → `StaleOracle`, `PriceBelowMinimum`, или `PriceDeviationTooLarge`.

### 4. Расчёт динамической комиссии

| Vault Coverage | Fee | В bps | Описание |
|---------------|-----|-------|----------|
| > 200% | base/2 | 2 bps | Vault здоров → скидка |
| 150–200% | base×5 | 20 bps | Нормально |
| 100–150% | base×10 | 40 bps | Повышенная |
| < 100% | base×20 | 80 bps | Критическая |

Maximum: 100 bps (1%). Minimum: 1 bps.

### 5. Transfer USDC → Vault

```
CPI: TokenProgram.Transfer
  from: user_usdc (ATA)
  to:   vault_usdc (PDA)
  amount: usdc_amount (полная сумма, fee остаётся в vault)
```

### 6. Mint tokens → User

```
CPI: TokenProgram.MintTo
  mint:      shortsol_mint (PDA)
  to:        user_shortsol (ATA)
  authority: mint_authority (PDA, подписывает программа)
  amount:    tokens (рассчитано в шаге 4)
```

### 7. Vault Reconciliation

```
vault_usdc.reload()  // Перечитываем реальный баланс с chain
require!(vault_usdc.amount >= expected)  // Проверяем что CPI не обманул
```

Если реальный баланс vault меньше ожидаемого → `InsufficientLiquidity`.

### 8. Обновление Pool State

```
pool.circulating   += tokens
pool.total_minted  += tokens
pool.vault_balance  = expected_vault (reconciled)
pool.total_fees    += fee_amount
pool.last_oracle_price     = sol_price
pool.last_oracle_timestamp = oracle.timestamp
```

### 9. Fee Distribution (LP)

```
Если LP total supply > 0:
  fee_per_share += fee_amount × 1e12 / lp_total_supply
  total_lp_fees_pending += fee_amount

Комиссия распределяется пропорционально LP shares.
```

### 10. Event Emission

```rust
MintEvent {
    user:           wallet pubkey
    usdc_in:        100_000_000 (100 USDC)
    tokens_out:     1_174_800_000 (1.1748 shortSOL)
    sol_price:      84_570_000_000 ($84.57)
    shortsol_price: 85_110_000_000 ($85.11)
    fee:            20_000 ($0.02)
    timestamp:      1774870000
}
```

---

## Slippage Protection

Пользователь передаёт `min_tokens_out` — минимальное количество токенов. Если расчётное количество < min → транзакция откатывается с `SlippageExceeded`.

```
Фронтенд: min_tokens_out = expected × (1 − slippage_bps / 10000)
Default slippage: 1% (100 bps)
MCP Server: 2% (200 bps)
```

---

## Аккаунты транзакции

| # | Аккаунт | Тип | Описание |
|---|---------|-----|----------|
| 1 | `pool_state` | PDA, mut | Состояние пула |
| 2 | `vault_usdc` | PDA, mut | USDC хранилище |
| 3 | `shortsol_mint` | PDA, mut | Mint inverse-токена |
| 4 | `mint_authority` | PDA | Подписант для MintTo |
| 5 | `price_update` | Account | Pyth PriceUpdateV2 |
| 6 | `usdc_mint` | Account | USDC mint |
| 7 | `user_usdc` | ATA, mut | USDC пользователя |
| 8 | `user_shortsol` | ATA, mut | Inverse-токен пользователя |
| 9 | `user` | Signer, mut | Кошелёк пользователя |
| 10 | `funding_config` | PDA, mut, optional | Конфигурация funding |
| 11 | `token_program` | Program | SPL Token |
| 12 | `system_program` | Program | System |

---

## Ограничения

| Ограничение | Значение | Причина |
|-------------|----------|---------|
| Min amount | > 0 USDC | Защита от пустых транзакций |
| Rate limit | 2 сек между операциями | Anti-sandwich |
| Max fee | 1% (100 bps) | Caps в calc_dynamic_fee |
| Oracle staleness | 259,200 сек (devnet) | Stock feeds на выходных |
| Oracle deviation | 15% от кэша | Защита от манипуляции |
| Oracle confidence | < 2% | Pyth confidence check |
| Price floor | > $1.00 | Защита от экстремального краха |
| Funding required | Если FundingConfig exists | MEDIUM-02 fix |

---

## Коды ошибок (Mint)

| Код | Hex | Имя | Описание |
|-----|-----|-----|----------|
| 6000 | 0x1770 | Paused | Пул на паузе |
| 6001 | 0x1771 | StaleOracle | Цена устарела или feed_id невалиден |
| 6002 | 0x1772 | PriceBelowMinimum | SOL < $1.00 |
| 6003 | 0x1773 | PriceDeviationTooLarge | Отклонение > 15% |
| 6004 | 0x1774 | InsufficientLiquidity | Vault reconciliation failed |
| 6005 | 0x1775 | AmountTooSmall | amount = 0 |
| 6006 | 0x1776 | MathOverflow | Арифметическое переполнение |
| 6007 | 0x1777 | SlippageExceeded | tokens < min_tokens_out |
| 6010 | 0x177A | RateLimitExceeded | < 2 сек с предыдущей операции |
| 6018 | 0x1782 | FundingConfigRequired | FundingConfig не передан |

---

## Вызов через MCP

```
# Симуляция (без транзакции)
→ simulate_mint { "usdc_amount": 100, "pool_id": "sol" }
← { "expectedOutput": "1.1748 shortSOL", "fee": "$0.02", "feePercent": "0.02%" }

# Исполнение
→ mint { "usdc_amount": 100, "pool_id": "sol" }
← { "success": true, "signature": "3tAM59...", "explorer": "https://..." }
```

---

## Вызов через Frontend

```typescript
const { mint } = useSolshort("sol");
await mint(
  new BN(100_000_000),           // 100 USDC
  new PublicKey("CAMk3...heeGn") // USDC mint
);
```

Frontend автоматически:
1. Постит Pyth price update (PythSolanaReceiver SDK)
2. Создаёт ATA если нужно
3. Рассчитывает slippage protection (1%)
4. Отправляет updatePrice + mint в одной транзакции

---

*Mint — единственный способ создать inverse-токены. Каждый токен обеспечен USDC в vault.*
