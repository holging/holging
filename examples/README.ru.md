# Примеры агентов Holging

Готовые к запуску примеры интеграции с Holging Transaction Builder API.

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

## Что они делают

Оба примера выполняют одинаковый 8-шаговый цикл:

1. **Получить USDC** — забрать 5,000 devnet USDC из крана
2. **Сканировать рынок** — получить цены всех 4 пулов
3. **Проверить позицию** — баланс кошелька (SOL, USDC, shortSOL)
4. **Симулировать минт** — предпросмотр: 100 USDC → ? shortSOL
5. **Минт** — построить tx → подписать локально → отправить в Solana
6. **Проверить** — баланс после минта
7. **Вывод** — построить tx → подписать локально → отправить в Solana
8. **Итог** — подтвердить возврат USDC

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `HOLGING_API` | `https://api.holging.com` | Базовый URL API |
| `RPC_URL` | `https://api.devnet.solana.com` | Solana RPC |
| `WALLET_PATH` | `./wallet.json` | Путь к файлу ключа |

## Справка по API

Полная документация: [docs/ru/API.md](../docs/ru/API.md)
