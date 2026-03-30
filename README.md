# Holging — Tokenized Inverse Exposure on Solana

[🇬🇧 English](#english) · [🇷🇺 Русский](#русский) · [🇨🇳 中文](#中文)

---

<a id="english"></a>
## 🇬🇧 English

**Inverse ETF for Solana.** One token, one click, zero liquidations.

Deposit USDC → receive **shortSOL** — an SPL token whose price moves inversely to SOL. No margin, no liquidation, no expiration.

```
shortSOL_price = k / SOL_price
```

**Holging Strategy:** 50% SOL + 50% shortSOL = mathematically guaranteed profit from any price movement. Proven in Lean 4.

### Links

| | |
|---|---|
| 🌐 **App** | [holging.com](https://holging.com) |
| ⚡ **API** | [api.holging.com](https://api.holging.com) |
| 📦 **Program** | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` |
| 🔗 **Network** | Solana Devnet |

### Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/en/API.md) | Transaction Builder API for AI agents |
| [Pitch](docs/en/PITCH.md) | Investor pitch |
| [Strategy Guide](docs/en/STRATEGY.md) | Holging strategy explained |
| [Token Spec](docs/en/TOKEN.md) | shortSOL token specification |
| [LP Guide](docs/en/LP.md) | Liquidity provider guide |
| [Mint Rules](docs/en/MINT_RULES.md) | Token minting specification |
| [Math](docs/en/MATH.md) | Mathematical architecture |
| [Security](docs/en/SECURITY.md) | Security audit report |
| [Mainnet Checklist](docs/en/MAINNET.md) | Mainnet readiness |

### Agent Examples

```bash
# TypeScript
npx ts-node examples/agent-typescript.ts

# Python
python examples/agent-python.py
```

---

<a id="русский"></a>
## 🇷🇺 Русский

**Обратный ETF для Solana.** Один токен, один клик, ноль ликвидаций.

Депозит USDC → получите **shortSOL** — SPL-токен, цена которого движется обратно SOL. Без маржи, без ликвидации, без срока истечения.

```
цена_shortSOL = k / цена_SOL
```

**Стратегия Holging:** 50% SOL + 50% shortSOL = математически гарантированная прибыль от любого движения цены. Доказано в Lean 4.

### Ссылки

| | |
|---|---|
| 🌐 **Приложение** | [holging.com](https://holging.com) |
| ⚡ **API** | [api.holging.com](https://api.holging.com) |
| 📦 **Программа** | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` |
| 🔗 **Сеть** | Solana Devnet |

### Документация

| Документ | Описание |
|----------|----------|
| [Справка API](docs/ru/API.md) | Transaction Builder API для AI-агентов |
| [Питч](docs/ru/PITCH.md) | Инвестиционная презентация |
| [Стратегия](docs/ru/STRATEGY.md) | Стратегия Holging |
| [Спецификация токена](docs/ru/TOKEN.md) | Спецификация shortSOL |
| [LP гайд](docs/ru/LP.md) | Руководство LP-провайдера |
| [Правила минта](docs/ru/MINT_RULES.md) | Спецификация минта токенов |

---

<a id="中文"></a>
## 🇨🇳 中文

**Solana 的反向 ETF。** 一个代币，一键操作，零清算风险。

存入 USDC → 获得 **shortSOL** — 价格与 SOL 反向变动的 SPL 代币。无保证金、无清算、无到期。

```
shortSOL_price = k / SOL_price
```

**Holging 策略：** 50% SOL + 50% shortSOL = 数学保证的任何价格变动利润。已在 Lean 4 中证明。

### 链接

| | |
|---|---|
| 🌐 **应用** | [holging.com](https://holging.com) |
| ⚡ **API** | [api.holging.com](https://api.holging.com) |
| 📦 **程序** | `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX` |
| 🔗 **网络** | Solana Devnet |

### 文档

| 文档 | 描述 |
|------|------|
| [API 参考](docs/zh/API.md) | AI 代理交易构建器 API |
| [项目介绍](docs/zh/PITCH.md) | 投资者演示 |
| [策略指南](docs/zh/STRATEGY.md) | Holging 策略说明 |
| [代币规格](docs/zh/TOKEN.md) | shortSOL 代币规格 |
| [LP 指南](docs/zh/LP.md) | 流动性提供者指南 |
| [铸造规则](docs/zh/MINT_RULES.md) | 代币铸造规格 |

---

## Architecture

```
┌─────────────────────────────┐
│  Frontend (React + Vite)    │  holging.com
├─────────────────────────────┤
│  Transaction Builder API    │  api.holging.com
├─────────────────────────────┤
│  Pyth Network (oracle)      │  4 price feeds
├─────────────────────────────┤
│  Solana Program (Anchor)    │  20 instructions
│  Program ID: CLmSD9e...     │  2,873 lines Rust
└─────────────────────────────┘
```

## License

MIT
