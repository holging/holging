# Holging MCP-сервер — Справочник инструментов

> **11 инструментов для AI-агентов**: чтение, симуляция, трейдинг и управление ликвидностью в протоколе Holging.

---

## Что такое MCP

[Model Context Protocol](https://modelcontextprotocol.io) (MCP) — открытый стандарт, позволяющий AI-ассистентам вызывать внешние инструменты. MCP-сервер Holging предоставляет 11 инструментов, дающих любому MCP-совместимому агенту (Claude, Cursor и др.) полный доступ к протоколу Holging на Solana.

---

## Быстрая настройка

Добавьте в `.mcp.json` (корень проекта) или конфигурацию Claude Desktop:

```json
{
  "mcpServers": {
    "holging": {
      "command": "node",
      "args": ["<path>/mcp-server/dist/index.js"],
      "env": {
        "RPC_URL": "https://api.devnet.solana.com",
        "ANCHOR_WALLET": "<path>/solana-wallet.json",
        "USDC_MINT": "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn"
      }
    }
  }
}
```

Сначала соберите сервер:

```bash
cd mcp-server && npm install && npm run build
```

---

## Поддерживаемые пулы

| Pool ID | Актив | Инверсный токен | Pyth Feed |
|---------|-------|-----------------|-----------|
| `sol`   | SOL   | shortSOL        | SOL/USD   |
| `tsla`  | TSLA  | shortTSLA       | TSLA/USD  |
| `spy`   | SPY   | shortSPY        | SPY/USD   |
| `aapl`  | AAPL  | shortAAPL       | AAPL/USD  |

Все инструменты принимают необязательный параметр `pool_id` (по умолчанию: `sol`).

---

## Инструменты по категориям

### 📖 Чтение (4 инструмента)

| Инструмент | Описание | Параметры |
|------------|----------|-----------|
| `get_pool_state` | Баланс vault, coverage ratio, динамическая комиссия, статистика LP, объёмы mint/redeem | `pool_id` |
| `get_price` | Цена из оракула Pyth в реальном времени + цена инверсного токена + confidence | `pool_id` |
| `get_all_prices` | Цены и статусы ВСЕХ пулов одним вызовом | — |
| `get_position` | Балансы кошелька: SOL, USDC, инверсные токены (в USD), LP-позиция | `pool_id`, `wallet_address` |

### 🧪 Симуляция (2 инструмента)

| Инструмент | Описание | Параметры |
|------------|----------|-----------|
| `simulate_mint` | Превью: USDC → инверсные токены. Ожидаемый выход и комиссия | `usdc_amount`, `pool_id` |
| `simulate_redeem` | Превью: инверсные токены → USDC. Ожидаемый выход и комиссия | `token_amount`, `pool_id` |

### 💱 Трейдинг (2 инструмента)

| Инструмент | Описание | Параметры |
|------------|----------|-----------|
| `mint` | Внести USDC, получить инверсные токены. Обновляет Pyth, slippage 2% | `usdc_amount`, `pool_id` |
| `redeem` | Сжечь инверсные токены, получить USDC. Обновляет Pyth, slippage 2% | `token_amount`, `pool_id` |

### 🏦 Провайдер ликвидности (3 инструмента)

| Инструмент | Описание | Параметры |
|------------|----------|-----------|
| `add_liquidity` | Внести USDC как LP. Минимум $100. LP-доли пропорциональны vault | `usdc_amount`, `pool_id` |
| `remove_liquidity` | Сжечь LP-доли, забрать пропорциональную часть USDC из vault | `lp_shares`, `pool_id` |
| `claim_lp_fees` | Забрать накопленные торговые комиссии на кошелёк | `pool_id` |

---

## Примеры рабочих процессов

### Сканирование рынка

```
→ get_all_prices
← SOL: $84.37 | shortSOL: $85.31
   TSLA: $178.50 | shortTSLA: $40.34
   SPY: $512.20 | shortSPY: $14.06
   AAPL: $195.80 | shortAAPL: $36.77
```

### Вход в Holging (50/50 SOL + shortSOL)

```
→ get_pool_state { "pool_id": "sol" }          # Проверить vault
← coverage: 6433%, fee: 0.04%, paused: false ✅

→ simulate_mint { "usdc_amount": 5000 }         # Превью
← ожидается: 58.33 shortSOL, комиссия: $2.00

→ mint { "usdc_amount": 5000 }                   # Исполнение
← ✅ tx: 3tAM59...

→ get_position { "pool_id": "sol" }              # Проверка
← shortSOL: 58.33, стоимость: $5,000
```

### LP-депозит + сбор комиссий

```
→ add_liquidity { "usdc_amount": 10000 }         # Внести как LP
← ✅ LP shares: 9,950.00

→ claim_lp_fees { "pool_id": "sol" }             # Забрать комиссии
← ✅ получено: $12.50 USDC
```

---

## Конфигурация агента

Пример конфигурации бота для автоматизированного Holging:

```json
{
  "strategy": "holging",
  "pool_id": "sol",
  "capital_usdc": 10000,
  "rebalance_threshold_pct": 20,
  "check_interval_minutes": 60,
  "tools": {
    "scan": "get_all_prices",
    "health": "get_pool_state",
    "preview": "simulate_mint / simulate_redeem",
    "execute": "mint / redeem",
    "verify": "get_position"
  }
}
```

### Автоматический цикл

```
SCAN  → get_all_prices           (обзор рынка)
CHECK → get_pool_state           (здоровье vault)
EVAL  → сравнить вход vs текущая (порог ±20%)
SIM   → simulate_mint/redeem     (превью сделки)
EXEC  → mint / redeem            (on-chain транзакция)
VERIFY→ get_position             (подтвердить балансы)
WAIT  → повторять каждый час
```

---

## Ссылки

- [Стратегия Holging](../en/HOLGING_STRATEGY.md)
- [Спецификация shortSOL](../en/SHORTSOL.md)
- [Протокол MCP](https://modelcontextprotocol.io)
- [Pyth Network](https://pyth.network)

---

*11 инструментов. 4 пула. Полный доступ к протоколу для AI-агентов.*
