# Holging — Математическая архитектура

## Обзор

Holging — протокол токенизированной обратной экспозиции на Solana. Пользователи вносят USDC для минта токенов **shortSOL**, стоимость которых движется обратно пропорционально цене SOL. Ключевая инновация — стратегия **holging** — портфель 50/50 из SOL + shortSOL, который математически гарантированно прибылен вне зависимости от направления цены.

**Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
**Сеть:** Devnet

---

## 1. Константы

| Символ | Значение | Описание |
|--------|----------|----------|
| `PRICE_PRECISION` | 10⁹ | Масштабирующий множитель фиксированной точки |
| `USDC_DECIMALS` | 6 | 1 USDC = 10⁶ базовых единиц |
| `SHORTSOL_DECIMALS` | 9 | 1 shortSOL = 10⁹ базовых единиц |
| `DECIMAL_SCALING` | 10³ | = 10^(9−6), конвертация USDC↔shortSOL |
| `BPS_DENOMINATOR` | 10,000 | Знаменатель базисных пунктов |
| `DEFAULT_FEE_BPS` | 4 | Комиссия 0.04% |
| `MIN_VAULT_RATIO_BPS` | 9,500 | Автоматический выключатель на 95% |
| `MIN_VAULT_POST_WITHDRAWAL_BPS` | 11,000 | Минимум при выводе админом — 110% |
| `MAX_PRICE_DEVIATION_BPS` | 1,500 | Макс. отклонение от кэша — 15% |
| `MAX_CONFIDENCE_PCT` | 2 | Доверительный интервал оракула — 2% |
| `MAX_STALENESS_SECS` | 120 | Свежесть оракула — 120с (devnet) |
| `MIN_PRICE` | 10⁹ | Минимальная цена: $1.00 SOL |
| `SECS_PER_DAY` | 86,400 | Секунд в сутках (знаменатель ставки фондирования) |
| `MAX_FUNDING_RATE_BPS` | 100 | Макс. k-decay: 1%/день ≈ 97% сложный процент/год |
| `MAX_FUNDING_ELAPSED_SECS` | 2,592,000 | Макс. elapsed за вызов `accrue_funding` (30 дней) |

---

## 2. Основная функция ценообразования

### 2.1 Цена shortSOL

Цена shortSOL — обратная (реципрокная) функция от цены SOL:

$$
\text{shortSOL\_price}(t) = \frac{k \times \text{PRICE\_PRECISION}}{P_{\text{SOL}}(t)}
$$

Где:
- $P_{\text{SOL}}(t)$ — текущая цена SOL/USD (масштабированная ×10⁹)
- $k$ — нормализующая константа (u128)

### 2.2 Константа k (инициализация)

$$
k = \frac{P_0^2}{\text{PRICE\_PRECISION}}
$$

Где $P_0$ — цена SOL на момент инициализации пула.

**Свойство:** При инициализации shortSOL стартует по той же цене, что и SOL:

$$
\text{shortSOL}(0) = \frac{k \times \text{PRICE\_PRECISION}}{P_0} = \frac{P_0^2 / \text{PRICE\_PRECISION} \times \text{PRICE\_PRECISION}}{P_0} = P_0
$$

### 2.3 k нейтрален к доходности

Доходность не зависит от k:

$$
\text{Return} = \frac{\text{shortSOL}(t_1)}{\text{shortSOL}(t_0)} - 1 = \frac{k / P_1}{k / P_0} - 1 = \frac{P_0}{P_1} - 1
$$

Два пула с разными k дают одинаковую процентную доходность.

---

## 3. Минт (USDC → shortSOL)

### 3.1 Вычет комиссии

$$
\text{fee} = \frac{\text{usdc\_amount} \times \text{fee\_bps}}{10{,}000}
$$

$$
\text{effective\_usdc} = \text{usdc\_amount} - \text{fee}
$$

### 3.2 Выпущенные токены

$$
\text{tokens} = \frac{\text{effective\_usdc} \times \text{DECIMAL\_SCALING} \times \text{PRICE\_PRECISION}}{\text{shortSOL\_price}}
$$

В развёрнутом виде:

$$
\text{tokens} = \frac{\text{effective\_usdc} \times 10^3 \times 10^9}{\text{shortSOL\_price}}
$$

### 3.3 Обновление состояния

```
circulating     += tokens
total_minted    += tokens
vault_balance   += usdc_amount    ← полная сумма (комиссия остаётся в хранилище)
fees_collected  += fee
```

### 3.4 Числовой пример

SOL = $170, k = 28,900 × 10⁹, пользователь вносит 170 USDC:

```
shortSOL_price = 28,900×10⁹ × 10⁹ / (170×10⁹) = 170×10⁹
fee = 170,000,000 × 4 / 10,000 = 68,000 (= $0.068)
effective_usdc = 170,000,000 − 68,000 = 169,932,000
tokens = 169,932,000 × 1,000 × 10⁹ / (170×10⁹) = 999,600,000 (≈ 0.9996 shortSOL)
```

---

## 4. Погашение (shortSOL → USDC)

### 4.1 Валовый объём USDC

$$
\text{gross\_usdc} = \frac{\text{shortsol\_amount} \times \text{shortSOL\_price}}{\text{PRICE\_PRECISION} \times \text{DECIMAL\_SCALING}}
$$

### 4.2 Комиссия (сторона Bid)

$$
\text{fee} = \frac{\text{gross\_usdc} \times \text{fee\_bps}}{10{,}000}
$$

$$
\text{net\_usdc} = \text{gross\_usdc} - \text{fee}
$$

### 4.3 Обновление состояния

```
circulating     -= shortsol_amount
total_redeemed  += shortsol_amount
vault_balance   -= net_usdc       ← комиссия остаётся в хранилище
fees_collected  += fee
```

### 4.4 Эффективный спред

$$
\text{Spread} = \text{Ask} - \text{Bid} = \text{shortSOL\_price} \times \frac{2 \times \text{fee\_bps}}{10{,}000} = \text{shortSOL\_price} \times 0.08\%
$$

---

## 5. Валидация оракула

### 5.1 Конвертация цены Pyth

Pyth возвращает `(price, exponent)`. Пример: price=17250, expo=−2 означает $172.50.

$$
\text{adjusted\_price} = \begin{cases}
\text{raw\_price} \times 10^{\text{expo}} \times \text{PRICE\_PRECISION} & \text{if expo} \geq 0 \\
\frac{\text{raw\_price} \times \text{PRICE\_PRECISION}}{10^{|\text{expo}|}} & \text{if expo} < 0
\end{cases}
$$

### 5.2 Проверка доверительного интервала

$$
\text{conf\_pct} = \frac{\text{adjusted\_conf} \times 100}{\text{adjusted\_price}} < 2\%
$$

### 5.3 Проверка отклонения (от кэшированной цены)

$$
\text{deviation\_bps} = \frac{|\text{adjusted\_price} - \text{last\_cached\_price}| \times 10{,}000}{\text{last\_cached\_price}} \leq 1{,}500
$$

### 5.4 Сводка защитных механизмов

| Механизм | Условие | Ошибка |
|----------|---------|--------|
| Устаревание | age > 120s | `StaleOracle` |
| Доверительный интервал | conf > 2% от цены | `OracleConfidenceTooWide` |
| Отклонение | Δ > 15% от кэша | `PriceDeviationTooHigh` |
| Минимальная цена | price < $1.00 | `PriceBelowMinimum` |

---

## 6. Автоматический выключатель (Circuit Breaker)

### 6.1 Обязательства хранилища

После погашения оставшиеся обязательства составляют:

$$
\text{obligations} = \frac{\text{remaining\_circulating} \times \text{shortSOL\_price}}{\text{PRICE\_PRECISION} \times \text{DECIMAL\_SCALING}}
$$

### 6.2 Коэффициент хранилища

$$
\text{vault\_ratio\_bps} = \frac{\text{remaining\_vault} \times 10{,}000}{\text{obligations}}
$$

### 6.3 Срабатывание

$$
\text{vault\_ratio\_bps} < 9{,}500 \implies \text{pool.paused} = \texttt{true}
$$

Транзакция отклоняется с ошибкой `CircuitBreaker`.

### 6.4 Анализ платёжеспособности

После одного минта по цене $P_0$ и изменения цены до $P_1$:

$$
\text{ratio} = \frac{P_1}{P_0} \times (1 + \text{fee})
$$

- Если $P_1 > P_0$ (SOL вырос): ratio > 1, избыточное обеспечение ✓
- Если $P_1 < P_0$ (SOL упал): нагрузка на хранилище возрастает
- Автоматический выключатель срабатывает до падения коэффициента ниже 95%

---

## 7. Стратегия Holging

### 7.1 Определение портфеля

Holging = 50% SOL + 50% shortSOL (равное долларовое распределение).

Пусть $x = P(t) / P(0)$ — мультипликатор цены SOL:

$$
V(x) = \frac{1}{2} \cdot x + \frac{1}{2} \cdot \frac{1}{x} = \frac{x + 1/x}{2}
$$

### 7.2 Гарантия AM-GM

По неравенству среднего арифметического и среднего геометрического:

$$
\frac{x + 1/x}{2} \geq \sqrt{x \cdot \frac{1}{x}} = 1 \quad \forall\, x > 0
$$

**Следовательно:** $V(x) \geq 1$ всегда. Портфель никогда не теряет стоимость (без учёта комиссий).

### 7.3 Формула P&L

$$
\text{P\&L}(x) = V(x) - 1 = \frac{x + 1/x}{2} - 1 = \frac{(x - 1)^2}{2x}
$$

Минимум при $x = 1$ (цена не изменилась), $\text{P\&L} = 0$.

### 7.4 Производные (греки)

Первая производная (дельта):
$$
\frac{dV}{dP} = \frac{1}{2P_0} - \frac{P_0}{2P^2}
$$

При $P = P_0$: дельта = 0 (дельта-нейтральный).

Вторая производная (гамма):
$$
\frac{d^2V}{dP^2} = \frac{P_0}{P^3} > 0 \quad \forall\, P > 0
$$

**Положительная гамма повсюду** — портфель выигрывает от волатильности в любом направлении.

### 7.5 Таблица сценариев

| Δ SOL | x | P&L SOL | P&L shortSOL | P&L портфеля |
|-------|---|---------|--------------|--------------|
| −90% | 0.10 | −90.0% | +900.0% | **+405.0%** |
| −75% | 0.25 | −75.0% | +300.0% | **+56.3%** |
| −50% | 0.50 | −50.0% | +100.0% | **+25.0%** |
| −25% | 0.75 | −25.0% | +33.3% | **+4.2%** |
| −10% | 0.90 | −10.0% | +11.1% | **+0.6%** |
| 0% | 1.00 | 0.0% | 0.0% | **0.0%** |
| +10% | 1.10 | +10.0% | −9.1% | **+0.5%** |
| +25% | 1.25 | +25.0% | −20.0% | **+2.5%** |
| +50% | 1.50 | +50.0% | −33.3% | **+8.3%** |
| +100% | 2.00 | +100.0% | −50.0% | **+25.0%** |
| +200% | 3.00 | +200.0% | −66.7% | **+66.7%** |

### 7.6 Реальный P&L (с учётом комиссий)

$$
\text{Real P\&L} = \frac{(x-1)^2}{2x} - 2 \times \text{fee\_roundtrip} - \text{gas}
$$

При fee_bps = 4: стоимость раундтрипа = 0.08%. Для выхода в плюс необходимо:

$$
\frac{(x-1)^2}{2x} > 0.0008
$$

Приблизительно: SOL должен сдвинуться на ±4% для прибыли после комиссий.

---

## 8. Обработка десятичных знаков токенов

### 8.1 Таблица конвертации

| Токен | Десятичные | 1 единица = | Название базовой единицы |
|-------|------------|-------------|--------------------------|
| USDC | 6 | 1,000,000 базовых единиц | "USDC lamports" |
| shortSOL | 9 | 1,000,000,000 базовых единиц | "shortSOL lamports" |
| SOL | 9 | 1,000,000,000 lamports | lamports |

### 8.2 Масштабирующий множитель

$$
\text{DECIMAL\_SCALING} = 10^{(\text{SHORTSOL\_DEC} - \text{USDC\_DEC})} = 10^{(9-6)} = 1{,}000
$$

Используется как при минте (умножение), так и при погашении (деление) для компенсации разницы в десятичных знаках.

---

## 9. Состояние пула

```
PoolState {
    authority:            Pubkey     // Ключ администратора
    pending_authority:    Pubkey     // Предложенный новый администратор (двухэтапная передача)
    k:                    u128       // Константа ценообразования (k-decay применяется ставкой фондирования)
    fee_bps:              u16        // Комиссия в базисных пунктах
    total_minted:         u64        // Общее количество выпущенных токенов
    total_redeemed:       u64        // Общее количество погашённых токенов
    circulating:          u64        // Текущее предложение (minted − redeemed)
    total_fees_collected: u64        // Накопленные комиссии (USDC)
    vault_balance:        u64        // USDC в хранилище
    pyth_feed:            Pubkey     // Адрес ценового канала оракула
    shortsol_mint:        Pubkey     // Адрес минта токена
    paused:               bool       // Аварийная остановка
    last_oracle_price:    u64        // Кэшированная цена SOL
    last_oracle_timestamp: i64       // Временная метка кэша
    bump:                 u8         // Bump PDA пула
    mint_auth_bump:       u8         // Bump PDA полномочий минта
}

FundingConfig {
    rate_bps:        u16   // Скорость k-decay в bps/день (0 = отключено)
    last_funding_at: i64   // Unix-метка последнего начисления
    bump:            u8    // Bump PDA
}
```

### Инварианты

```
circulating = total_minted − total_redeemed
vault_balance = Σ(usdc_in) − Σ(net_usdc_out)
vault_balance ≥ Σ(fees)  (комиссии никогда не покидают хранилище)
```

---

## 10. PDA Seeds

| PDA | Seeds | Назначение |
|-----|-------|------------|
| Pool State | `["pool", pool_id]` | Основной аккаунт состояния |
| shortSOL Mint | `["shortsol_mint", pool_id]` | Минт токена |
| Mint Authority | `["mint_auth", pool_id]` | Подписант для минта |
| USDC Vault | `["vault", usdc_mint, pool_id]` | Хранит депонированные USDC |
| Funding Config | `["funding", pool_state_pubkey]` | Ставка k-decay + временная метка |

---

## 11. Коды ошибок

| Код | Название | Значение |
|-----|----------|----------|
| 6000 | `Paused` | Пул приостановлен |
| 6001 | `StaleOracle` | Цена старше 30 секунд |
| 6002 | `OracleConfidenceTooWide` | Доверительный интервал > 2% |
| 6003 | `PriceDeviationTooHigh` | Отклонение > 15% от кэша |
| 6004 | `InsufficientLiquidity` | Хранилище не может покрыть погашение или вывод |
| 6005 | `AmountTooSmall` | Сумма = 0 или токенов = 0 |
| 6006 | `CircuitBreaker` | Коэффициент хранилища < 95% |
| 6007 | `RateLimitExceeded` | Задержка 2 секунды между действиями пользователя |
| 6008 | `PriceBelowMinimum` | SOL < $1.00 |
| 6009 | `MathOverflow` | Арифметическое переполнение |
| 6010 | `Unauthorized` | Неверные полномочия |
| 6011 | `InvalidFee` | fee_bps > 100 или rate_bps > MAX_FUNDING_RATE_BPS |
| 6012 | `CirculatingNotZero` | Нельзя обновить k при supply > 0 |
| 6013 | `InvalidPoolId` | Pool ID превышает 32 байта |
| 6014 | `SlippageExceeded` | Результат ниже min_tokens_out / min_usdc_out |
| 6015 | `NoPendingAuthority` | `accept_authority` вызван до `transfer_authority` |

---

## 12. События

### Пользовательские события
```
MintEvent        { user, usdc_in, tokens_out, sol_price, shortsol_price, fee, timestamp }
RedeemEvent      { user, tokens_in, usdc_out, sol_price, shortsol_price, fee, timestamp }
CircuitBreakerTriggered { vault_ratio_bps, timestamp }
```

### Административные события
```
AddLiquidityEvent    { authority, usdc_amount, new_vault_balance }
WithdrawFeesEvent    { authority, amount, remaining_vault }
RemoveLiquidityEvent { authority, usdc_amount, remaining_vault }
PauseEvent           { paused, authority }
UpdateFeeEvent       { old_fee_bps, new_fee_bps, authority }
UpdateKEvent         { new_k, authority }
ProposeAuthorityEvent   { current_authority, proposed_authority }
TransferAuthorityEvent  { old_authority, new_authority }
```

### События фондирования
```
FundingAccruedEvent  { k_before, k_after, elapsed_secs, rate_bps, timestamp }
```

---

## 13. Ставка фондирования (k-Decay)

### 13.1 Механизм

Протокол взимает непрерывную ставку фондирования путём убывания `k` со временем. Это компенсирует хранилищу асимметричную структуру выплат (держатели shortSOL получают прибыль от падения SOL, но хранилище поглощает убытки).

$$
k_{\text{new}} = k_{\text{old}} \times \frac{\text{denom} - \text{rate\_bps} \times \text{elapsed\_to\_apply}}{\text{denom}}
$$

$$
\text{denom} = \text{SECS\_PER\_DAY} \times \text{BPS\_DENOM} = 86{,}400 \times 10{,}000 = 864{,}000{,}000
$$

### 13.2 Примеры ставок

| rate_bps/день | Дневное убывание | Сложный процент/год |
|---|---|---|
| 1 | 0.01% | 3.5% |
| 10 | 0.10% | 30.6% |
| 50 | 0.50% | 83.9% |
| 100 | 1.00% | 97.4% |

### 13.3 Независимость от кипера

Фондирование применяется **инлайн** при каждом вызове `mint` и `redeem` (если `FundingConfig` передан как опциональный аккаунт). Это гарантирует, что пользователи всегда торгуют по актуальному k, вне зависимости от активности кипера.

### 13.4 Защита от k→0

Жёсткий лимит **30 дней** (`MAX_FUNDING_ELAPSED_SECS`) на вызов `accrue_funding` предотвращает обвал k до нуля при простое кипера. Временная метка продвигается на `elapsed_to_apply`, а не на `now` — необработанное время переносится на следующий вызов.

$$
\text{elapsed\_to\_apply} = \min(\text{elapsed}, \text{MAX\_FUNDING\_ELAPSED\_SECS})
$$

### 13.5 Влияние на цену shortSOL

Поскольку `shortSOL_price = k × 10⁹ / SOL_price`, меньшее k означает более низкую цену shortSOL при той же цене SOL. Держатели, которые не погашают токены, постепенно теряют стоимость через ставку фондирования — аналогично ставке фондирования на рынках бессрочных контрактов.

---

## 14. Анализ рисков

### 13.1 Неплатёжеспособность хранилища

При значительном падении SOL обязательства по shortSOL превышают баланс хранилища. Автоматический выключатель на 95% смягчает, но не устраняет проблему:

$$
\text{При падении SOL на 50\%: ratio} = \frac{P_1}{P_0} \times (1 + \text{fee}) = 0.5 \times 1.0004 = 0.5002
$$

Один минт → 50% обеспечение. Множественные минты по разным ценам улучшают коэффициент.

### 13.2 Округление

Все целочисленные деления округляются вниз (floor). Как при минте, так и при погашении округление в пользу протокола. Два последовательных деления при погашении (`/ PRICE_PRECISION / scaling`) теряют больше точности, чем одно комбинированное деление.

### 13.3 Оракул

- 30-секундное окно устаревания допускает фронтраннинг
- Pull-модель Pyth: любой может отправить обновление цены
- Проверка отклонения в 15% может быть постепенно сдвинута через серию транзакций
- Единственный оракул, без резервного

### 13.4 Комиссии vs прибыль Holging

Комиссия раундтрипа = 0.08%. Для малых движений SOL:

$$
\text{P\&L}(1 + \epsilon) \approx \frac{\epsilon^2}{2} \quad \text{(разложение Тейлора)}
$$

Точка безубыточности: $\epsilon^2 / 2 > 0.0008 \implies |\epsilon| > 4\%$

---

## 15. Краткая справка по формулам

| Что | Формула |
|-----|---------|
| Цена shortSOL | $k \times 10^9 / P_{\text{SOL}}$ |
| k (инициализация) | $P_0^2 / 10^9$ |
| k (убывание) | $k_{\text{old}} \times (\text{denom} - \text{rate} \times \text{elapsed}) / \text{denom}$ |
| Знаменатель фондирования | $86{,}400 \times 10{,}000 = 864{,}000{,}000$ |
| Комиссия минта | $\text{amount} \times \text{fee\_bps} / 10{,}000$ |
| Токены на выходе | $\text{effective} \times 10^3 \times 10^9 / \text{ssPrice}$ |
| USDC на выходе | $\text{tokens} \times \text{ssPrice} / 10^9 / 10^3$ |
| Holging V(x) | $(x + 1/x) / 2$ |
| Holging P&L | $(x - 1)^2 / (2x)$ |
| Коэффициент хранилища | $\text{vault} \times 10{,}000 / \text{obligations}$ |
| Минимум при выводе | $\text{obligations} \times 11{,}000 / 10{,}000$ |
| Доверительный интервал | $\text{conf} \times 100 / \text{price} < 2\%$ |
| Отклонение | $|\Delta| \times 10{,}000 / \text{cached} \leq 1{,}500$ |
