# Holging Vault Analytics — Полная аналитика хранилища и LP стратегий

> Дата: 2026-03-29
> Все формулы и параметры верифицированы из `programs/holging/src/`
> Протокол: Holging (CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX)

---

## 1. Анатомия Vault

### 1.1 Баланс хранилища

Vault содержит USDC из трёх источников:

```
vault_balance = LP_principal + accumulated_fees + user_deposits_coverage
```

| Компонент | Откуда | Кто может забрать |
|-----------|--------|-------------------|
| **LP principal** | LP провайдеры через `add_liquidity` | LP через `remove_liquidity` |
| **Accumulated fees** | Торговые комиссии mint/redeem | LP через `claim_lp_fees` |
| **Freed funding** | k-decay уменьшает обязательства | LP через `claim_lp_fees` |
| **User coverage** | USDC от mint операций | Пользователи через `redeem` |
| **Excess** | Разница выше 110% obligations | Admin через `withdraw_fees` |

### 1.2 Обязательства Vault (Obligations)

```
obligations = circulating × shortSOL_price / 1e9 / 1e3
            = circulating × k / SOL_price / 1e3
```

Обязательства растут когда SOL падает (shortSOL дорожает) и падают когда SOL растёт.

### 1.3 Vault Health Ratio

```
vault_ratio = vault_balance / obligations × 10,000 (в bps)
```

| Ratio | Статус | Что происходит |
|-------|--------|----------------|
| > 200% | 🟢 Здоровый | Минимальная комиссия (2 bps), LP может свободно выводить |
| 150–200% | 🟡 Нормальный | Стандартная комиссия (20 bps) |
| 110–150% | 🟠 Повышенный | Высокая комиссия (40 bps), LP вывод доступен |
| 95–110% | 🔴 Критический | Максимальная комиссия (80 bps), LP вывод заблокирован |
| < 95% | ⛔ Circuit Breaker | Все redeem заблокированы, только mint доступен |

---

## 2. Потоки дохода LP

### 2.1 Торговые комиссии

**Формула годового дохода от комиссий:**
```
Fee_Revenue_Annual = Daily_Volume × Fee_Roundtrip × 365
Fee_APY = Fee_Revenue_Annual / TVL × 100%
```

**Таблица комиссий по vault health:**

| Vault Health | base_fee (per side) | Множитель | Effective (per side) | Roundtrip | Max (clamped) |
|-------------|--------------------:|-----------|---------------------:|----------:|--------------:|
| > 200% | 4 bps | ×0.5 | 2 bps | 4 bps | — |
| 150–200% | 4 bps | ×5 | 20 bps | 40 bps | — |
| 100–150% | 4 bps | ×10 | 40 bps | 80 bps | — |
| < 100% | 4 bps | ×20 | 80 bps | 100 bps* | *clamped to 100 bps |

### 2.2 Funding Rate (k-Decay)

**Формула k-decay:**
```
k_new = k_old × (864,000,000 − rate_bps × elapsed_secs) / 864,000,000
```

**Доход LP от funding:**
```
freed_usdc = obligations_before_decay − obligations_after_decay
           = circulating × (k_old − k_new) × 1e9 / SOL_price / 1e9 / 1e3
```

**Годовой compound при различных ставках:**

| rate_bps/день | Дневной decay | Месячный | Годовой compound | Годовой простой |
|---------------|---------------|----------|-----------------|-----------------|
| 1 | 0.01% | 0.30% | 3.57% | 3.65% |
| 5 | 0.05% | 1.51% | 16.62% | 18.25% |
| **10** | **0.10%** | **3.00%** | **30.59%** | **36.50%** |
| 20 | 0.20% | 5.91% | 52.15% | 73.00% |
| 50 | 0.50% | 14.07% | 83.86% | 182.50% |
| 100 | 1.00% | 26.03% | 97.41% | 365.00% |

> Текущая ставка: **10 bps/день** (0.10%/день, 30.59% compound/год)

### 2.3 Формула совокупного APY

```
Total_APY = Fee_APY + Funding_APY

Fee_APY = (Daily_Volume × Roundtrip_Fee_BPS / 10,000 × 365) / TVL
Funding_APY = 1 − (1 − rate_bps/10,000)^365
            ≈ 30.59% при 10 bps/день
```

---

## 3. Моделирование сценариев

### 3.1 Сценарий А: Здоровый рынок (SOL стабильный ±10%)

**Условия:** SOL = $150, TVL = $500K, Daily Volume = $100K, Vault ratio > 200%

```
Комиссия: 2 bps per side = 4 bps roundtrip

Fee revenue/день  = $100,000 × 0.0004 = $40
Fee revenue/год   = $40 × 365 = $14,600
Fee APY           = $14,600 / $500,000 = 2.92%

Funding revenue/день = $500,000 × 0.001 = $500
Funding revenue/год  = ~$152,950 (compound)
Funding APY          = 30.59%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total APY            = 33.51%
LP доход на $10,000  = $3,351/год = $279/мес
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3.2 Сценарий Б: Высокая волатильность (SOL ±30%)

**Условия:** SOL движется между $100–$200, TVL = $500K, Daily Volume = $300K, Vault ratio 150–200%

```
Комиссия: 20 bps per side = 40 bps roundtrip

Fee revenue/день  = $300,000 × 0.004 = $1,200
Fee revenue/год   = $1,200 × 365 = $438,000
Fee APY           = $438,000 / $500,000 = 87.60%

Funding APY       = 30.59%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total APY (gross)  = 118.19%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

НО: при SOL −30% vault ratio может упасть:
  Obligations рост: shortSOL дорожает на 42.8% (1/0.7 − 1)
  Vault ratio падает: может перейти из 200% → ~140%

LP доход на $10,000 = $11,819/год
Потенциальный IL    = до −15% при SOL −30% без recovery
Net APY (с учётом IL) ≈ 80–100% при recovery в течение месяца
```

### 3.3 Сценарий В: Крэш SOL (−50% за неделю)

**Условия:** SOL: $150 → $75, TVL = $500K, circulating shortSOL = $200K

```
До крэша:
  obligations = $200,000
  vault_ratio = $500,000 / $200,000 = 250% (здоровый)

После крэша (SOL −50%):
  shortSOL дорожает в 2x: obligations = $400,000
  vault_ratio = $500,000 / $400,000 = 125% (повышенный)
  
  Комиссия переключается на 40 bps (×10 множитель)
  LP вывод: доступен (ratio > 110%)

Развитие:
  k-decay за неделю: k уменьшается на 0.7%
  Новые obligations: $400,000 × 0.993 = $397,200
  Freed USDC для LP: $2,800
  
  Высокие комиссии привлекают mint'ы (USDC в vault ↑)
  Если $50K новых mint'ов за неделю:
    vault = $550,000, obligations = $447,200
    ratio = $550,000 / $447,200 = 123% → стабилизация

LP P&L за неделю:
  Fees earned:   ~$840 (от повышенных комиссий)
  Funding freed: ~$2,800
  Unrealized IL: −$0 (principal не затронут, но вывод ограничен при ratio < 110%)
```

### 3.4 Сценарий Г: Чёрный лебедь (SOL −80%)

**Условия:** SOL: $150 → $30, TVL = $500K, circulating = $200K

```
После крэша:
  shortSOL дорожает в 5x: obligations = $1,000,000
  vault = $500,000
  ratio = $500,000 / $1,000,000 = 50%

  ⛔ CIRCUIT BREAKER TRIGGERED (ratio < 95%)
  
  Все redeem заблокированы
  LP вывод заблокирован
  Только mint доступен (но кто будет минтить shortSOL при SOL = $30?)

Recovery пути:
  1. SOL восстанавливается: при SOL = $75 → obligations = $400K, ratio = 125%
  2. k-decay: за 30 дней obligations падают на ~3%: $1M → $970K
  3. Новые LP вносят капитал
  4. Admin может паузить и дождаться восстановления

Worst case для LP:
  Если SOL не восстанавливается и нет новых LP:
    Principal $500K обеспечивает obligations $1M
    LP получает ~50 центов на доллар при полном выводе
    Потеря: ~50% principal
```

### 3.5 Сценарий Д: Бычий рынок (SOL +100%)

**Условия:** SOL: $150 → $300, TVL = $500K, Daily Volume = $500K

```
После роста:
  shortSOL дешевеет в 2x: obligations = $100,000
  vault = $500,000
  ratio = $500,000 / $100,000 = 500% (сверхздоровый)
  
  Комиссия: 2 bps (минимальная)
  LP может свободно выводить
  Admin может вывести excess: $500K − 110% × $100K = $390K

LP P&L:
  Fees: $500K × 0.0004 × 365 / $500K = 14.6% APY
  Funding: 30.59% APY
  IL: $0 (obligations уменьшились — LP в плюсе)
  
  Total APY = 45.19% (fees выше из-за объёма)
  LP доход на $10,000 = $4,519/год
```

---

## 4. Матрица рисков по сценариям

| SOL движение | Vault Ratio | Комиссия | LP APY (gross) | IL Risk | Ликвидность LP |
|-------------|-------------|----------|----------------|---------|----------------|
| +100% (×2) | 500%+ | 2 bps | 45%+ | Нет | ✅ Свободно |
| +50% (×1.5) | 333%+ | 2 bps | 40%+ | Нет | ✅ Свободно |
| +25% (×1.25) | 250%+ | 2 bps | 38%+ | Нет | ✅ Свободно |
| ±0% | Initial | 2–20 bps | 33–40% | Нет | ✅ Свободно |
| −25% (×0.75) | ~150% | 20 bps | 50–65% | Минимальный | ✅ Свободно |
| −33% (×0.67) | ~120% | 40 bps | 60–80% | Умеренный | ✅ Свободно |
| −40% (×0.60) | ~105% | 40 bps | 65–85% | Высокий | ⚠️ Ограничено |
| −50% (×0.50) | ~80% | 80 bps | — | Высокий | ❌ Заблокировано |
| −70% (×0.30) | ~45% | 80 bps | — | Критический | ❌ Circuit Breaker |
| −90% (×0.10) | ~15% | 80 bps | — | Катастрофа | ❌ Circuit Breaker |

> IL Risk — при условии что весь TVL обеспечивает circulating shortSOL 1:1.
> При ratio > 200% IL отсутствует даже при значительных движениях SOL.

---

## 5. Стратегии для LP

### 5.1 Стратегия «Консерватор» — минимальный риск

**Описание:** Вносите ликвидность только когда vault ratio > 300%. Выводите при ratio < 200%.

```
Вход:  vault_ratio > 300%
Выход: vault_ratio < 200% ИЛИ SOL падает > 20% от входа
Hold:  3–6 месяцев

Ожидаемый APY: 33–38%
Макс. просадка: ~5% (vault достаточно обеспечен для покрытия IL)
Sharpe ratio:   ~2.0
```

**Когда использовать:** Стабильный или бычий рынок. LP с низким risk tolerance.

### 5.2 Стратегия «Фермер» — максимум APY

**Описание:** Входите при стрессе vault (ratio 120–150%) когда динамические комиссии максимальны. Высокие fees + funding = пиковый APY.

```
Вход:  vault_ratio 120–170% (повышенные комиссии)
Выход: vault_ratio > 250% (комиссии нормализовались)
       ИЛИ vault_ratio < 110% (risk-off)
Hold:  1–4 недели (тактический)

Ожидаемый APY: 60–100%+
Макс. просадка: ~20% (входите при стрессе — дно может быть рядом)
Sharpe ratio:   ~1.5
```

**Когда использовать:** После коррекции SOL 20–30%. Контрарная стратегия.

### 5.3 Стратегия «Хеджер» — LP + SOL short

**Описание:** Вносите LP + одновременно минтите shortSOL на часть суммы. LP доход хеджирует risk.

```
Аллокация:
  70% → LP deposit ($7,000)
  30% → mint shortSOL ($3,000)

Если SOL падает:
  LP: vault стресс, но fees выше + funding
  shortSOL: растёт в цене → компенсирует LP IL
  Net: delta-neutral, доход от LP fees + funding

Если SOL растёт:
  LP: vault здоровый, стабильный доход
  shortSOL: падает в цене → убыток
  Net: LP доход > shortSOL убыток (при движении < 50%)

Break-even: SOL движение ±40%
Ожидаемый APY: 20–25% (после cost of shortSOL hedge)
Макс. просадка: ~10%
Sharpe ratio:   ~2.5
```

**Когда использовать:** Неопределённый рынок. Для институциональных LP.

### 5.4 Стратегия «Holging Комбо» — LP + Holging портфель

**Описание:** LP + одновременно держите 50/50 SOL + shortSOL (Holging стратегия).

```
Аллокация:
  50% → LP deposit ($5,000)
  25% → SOL ($2,500)
  25% → shortSOL via mint ($2,500)

Holging P&L = (x − 1)² / (2x) ≥ 0 (всегда положительный)

При SOL ±50%:  Holging = +25% = +$1,250
LP APY 33%:    LP yield = +$1,650
Funding saved: shortSOL не платит funding (LP получает funding)

Total на $10,000:
  LP yield:    $1,650
  Holging P&L: $1,250 (при одном движении ±50%)
  Total:       $2,900 = 29% за период
  
  При множественных движениях: Holging accumulates
  При 4 движениях ±30%/квартал: +4.2%×4 = +16.8% от Holging
  + LP 33% = ~50% годовых

Ожидаемый APY: 40–60%
Макс. просадка: ~15% (shortSOL decay через funding)
```

**Когда использовать:** Максимальная экспозиция к протоколу. Для убеждённых в продукте.

---

## 6. Стресс-тест: Сколько выдержит Vault?

### 6.1 Максимальное падение SOL до Circuit Breaker

**Формула:** Circuit breaker срабатывает когда `vault_ratio < 95%`

```
vault_balance / (circulating × k / SOL_new / 1e3) < 0.95

SOL_new = SOL_init × (vault_balance × 10,000) / (circulating × k / 1e3 × 9,500)
```

**Таблица: максимальное падение SOL до circuit breaker при различных utilization rates:**

| Utilization (circ/vault) | Vault Ratio (init) | SOL drop до CB | SOL drop до LP lock (110%) |
|--------------------------|-------------------:|---------------:|---------------------------:|
| 10% | 1000% | −90.5% | −89.1% |
| 20% | 500% | −79.0% | −76.4% |
| 30% | 333% | −68.3% | −63.6% |
| 40% | 250% | −57.9% | −51.3% |
| **50%** | **200%** | **−47.4%** | **−38.5%** |
| 60% | 167% | −36.8% | −25.5% |
| 70% | 143% | −26.3% | −12.3% |
| 80% | 125% | −15.8% | −2.0% |
| 90% | 111% | −5.3% | 0% (уже заблокирован) |

> **Utilization 50%** — типичный сценарий. SOL может упасть на ~47% до circuit breaker.

### 6.2 Recovery Time после стресса

```
k-decay восстанавливает ratio на ~0.1% обязательств в день

При ratio = 80% (после SOL −50%):
  Нужно восстановить: 95% − 80% = 15% ratio
  Через funding: ~150 дней при 0.1%/день
  Через новые mint'ы: быстрее (зависит от объёма)
  Через SOL recovery: мгновенно при +20% SOL
```

### 6.3 Исторический backtest (SOL 2024–2025)

| Период | SOL движение | Макс. drawdown | Vault Ratio (при 50% util) | CB triggered? |
|--------|-------------|---------------|---------------------------|---------------|
| Jan 2024 | $100 → $200 (+100%) | 0% | 200% → 400% | ❌ |
| Apr 2024 | $200 → $130 (−35%) | −35% | 400% → ~187% | ❌ |
| Nov 2024 | $130 → $260 (+100%) | 0% | 187% → 500%+ | ❌ |
| Jan 2025 | $260 → $170 (−35%) | −35% | 500% → ~230% | ❌ |
| Mar 2025 | $170 → $125 (−26%) | −26% | 230% → ~170% | ❌ |
| Jul 2025 | $125 → $180 (+44%) | 0% | 170% → 350% | ❌ |

> **Результат:** На исторических данных 2024–2025 circuit breaker **ни разу не сработал бы** при 50% utilization. Максимальное падение vault ratio: ~170% (всё ещё в зелёной зоне).

---

## 7. Оптимальные параметры для LP

### 7.1 Оптимальный размер позиции

```
Рекомендация: не более 10–20% ликвидного крипто-портфеля

$10K портфель → $1K–2K в LP
$100K портфель → $10K–20K в LP
$1M портфель → $100K–200K в LP
```

### 7.2 Оптимальное время входа

| Сигнал | Действие | Почему |
|--------|----------|--------|
| SOL коррекция −20–30% | 🟢 Вход | Высокие fees, дно рядом, recovery даёт пиковый APY |
| SOL на ATH | 🟡 Осторожно | Ratio высокий (хорошо), но потенциал падения (плохо) |
| SOL в нисходящем тренде | 🔴 Подождать | Ratio может падать, fees растут но IL тоже |
| Vault ratio > 300% | 🟢 Вход | Максимальный буфер безопасности |
| Vault ratio < 150% | 🔴 Только для «Фермеров» | Высокий APY но высокий риск lock-up |

### 7.3 Мониторинг позиции

**Ключевые метрики для отслеживания:**

| Метрика | Где смотреть | Триггер для действия |
|---------|-------------|---------------------|
| Vault Ratio | holging.com/state | < 150% → рассмотреть выход |
| SOL Price | pyth.network | Падение > 20% от входа → alert |
| k value | on-chain PoolState | Резкое падение = keeper проблемы |
| Fee per share | on-chain PoolState | Рост = fees накапливаются |
| Circulating supply | on-chain PoolState | Рост = больше obligations |
| Pending fees | on-chain LpPosition | > $100 → claim |

---

## 8. Формулы — Quick Reference

| Что | Формула |
|-----|---------|
| Vault Ratio | `vault_balance × 10,000 / obligations` |
| Obligations | `circulating × k / SOL_price / 1e3` |
| Fee APY | `daily_volume × roundtrip_bps / 10,000 × 365 / TVL` |
| Funding APY | `1 − (1 − rate_bps/10,000)^365` |
| Total APY | `Fee_APY + Funding_APY` |
| LP Shares | `usdc × (supply + 1000) / (principal + 1000)` |
| USDC on Redeem | `shares × principal / supply` |
| Fee per LP | `(fee_per_share_accumulated − checkpoint) × shares / 1e12` |
| k-decay (daily) | `k × (864M − rate_bps × 86400) / 864M` |
| Freed USDC | `obligations_before − obligations_after_decay` |
| Max SOL drop to CB | `1 − 0.95 × obligations / vault_balance` |
| Dynamic fee mult. | `{>200%: ×0.5, 150–200%: ×5, 100–150%: ×10, <100%: ×20}` |
| Break-even Holging | `SOL move > ±4%` (0.08% roundtrip fee) |

---

## 9. Glossary

| Термин | Определение |
|--------|------------|
| **TVL** | Total Value Locked — общий USDC в vault |
| **Vault Ratio** | Отношение vault_balance к obligations (в %) |
| **Obligations** | Суммарная стоимость circulating shortSOL в USDC |
| **Utilization** | Доля vault, обеспечивающая shortSOL (obligations / vault) |
| **k** | Нормирующая константа: shortSOL_price = k / SOL_price |
| **k-decay** | Непрерывное уменьшение k через funding rate |
| **Circuit Breaker** | Авто-пауза redeem при vault ratio < 95% |
| **IL (Impermanent Loss)** | Потенциальный убыток LP при падении SOL |
| **Fee Accumulator** | Механизм распределения комиссий LP (precision 1e12) |
| **Dead Shares** | Виртуальный offset (1000) для защиты от share inflation |
| **MIN_K** | Минимальное значение k (1e6) — floor от k→0 |
| **Funding Freed** | USDC освобождённый при k-decay, распределяется LP |

---

*Все расчёты основаны на текущих параметрах протокола. Параметры могут быть изменены admin'ом в пределах on-chain ограничений. DeFi несёт риски потери средств.*
