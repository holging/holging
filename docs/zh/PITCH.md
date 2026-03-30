# Holging — 投资者路演

## 一句话介绍
**Solana 上的反向 ETF。** 一个代币，一键操作，零清算风险。

---

## 问题（$47B 市场）

如今做空 SOL 你需要：
- **CEX**：KYC、保证金、资金费率、清算风险
- **永续合约 DEX**（Drift, Jupiter）：复杂、门槛高、持仓 ≠ 代币
- **杠杆反向代币**（Ethereum）：波动率衰减、路径依赖

**目前不存在一个简单的 SPL 代币来做空 SOL。**

---

## 解决方案

**shortSOL** — SPL 代币，价格 = k / SOL_price（乘法 1/x 模型）

- SOL 上涨 → shortSOL 下跌（反之亦然）
- **零波动率衰减** — 不同于杠杆 ETF，无需每日再平衡
- **零路径依赖** — 价格仅取决于当前 SOL 价格，与历史无关
- **零清算风险** — 只是钱包中的一个代币
- **零滑点** — 按 Pyth Network 预言机价格交易

---

## Holging 策略（独特知识产权）

50% SOL + 50% shortSOL = **在任何价格方向上都有数学保证的盈利**

```
P&L = (x - 1)² / (2x) ≥ 0    for any x > 0
```

**8 个定理已在 Lean 4 中被形式化证明** — Solana 上没有任何 DeFi 协议拥有机器校验的证明。相当于"没有时间衰减的永续跨式期权"。

---

## 竞争格局

*来源：Colosseum Copilot，分析了 5,400+ 个 Solana 项目*

| 项目 | 奖项 | 方法 | 与 Holging 对比 |
|---------|--------|----------|-------------|
| **Reflect Protocol** | Grand Prize $50K, Accelerator C2 | 通过 LST + 永续合约实现 Delta 中性 | 复杂，需要再平衡 |
| **Squeeze** | 1st DeFi $25K | 通过借贷实现杠杆多空 | 启动平台，非反向代币 |
| **Exponent** | 5th DeFi $5K | 收益衍生品 | 收益导向，非价格敞口 |
| **Hedge Fun** | Cypherpunk 2025 | 预测市场对冲 | 未代币化 |
| **Solistic Finance** | Breakout 2025 | 合成资产（股票、RWA） | 范围广泛，非专业化 |

**在 5,400+ 个项目中，没有任何项目实现了 1/x 反向代币。** Reflect（最接近的竞争对手，$50K Grand Prize）使用复杂的 Delta 中性策略，涉及永续合约和再平衡。Holging = 一个代币、一个公式、零维护。

Paradigm Research 确认："Everything Is A Perp" — 市场正朝着代币化衍生品方向发展。Friktion（Superteam 深度研究）证明了 Solana 上结构化产品的需求，但已关闭 — 这一赛道空缺。

---

## 进展

- **20 条指令**已部署在 Solana Devnet 上（20 个错误码，16 种事件类型）
- **4 个资金池上线**：shortSOL、shortTSLA、shortSPY、shortAAPL — 从第一天起即支持多资产
- **LP 系统**：add_liquidity、remove_liquidity、claim_lp_fees，SHARE_PRECISION 1e12
- **MCP Server v2.0**：11 个工具，支持 AI 代理交易（Claude、GPT 可编程化交易）
- **Burner Wallet**：内置浏览器钱包，自动 SOL 空投，零安装测试
- **动态费率**（基于金库健康度的 5-50 bps）
- **资金费率** — k 衰减 10 bps/天（约 30.6%/年）；在 mint/redeem 时内联应用，无需 keeper 依赖
- **两步权限转移** — propose + accept 模式，原子化且安全
- **提款下限 110%** — 管理员无法将金库提取至低于义务的 110%
- **熔断机制**（金库比率 < 95% 时自动暂停）
- **4 层预言机验证**（Pyth Network，4 个价格源）
- **金库对账**（CPI 后余额验证）
- **滑点保护**（默认 1% 容差）
- **频率限制**（2 秒冷却，防三明治攻击）
- **在线演示：** https://holging.com（8 个标签页：Mint、Redeem、LP、Holging、Holders、State、MCP、Risk）
- **形式化验证**（Lean 4，8 个定理）
- **GitHub：** https://github.com/holging
- **Program ID：** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

---

## 收入模型

- **每笔 0.20%**（往返 0.40%）— 动态调整，压力下增加
- 日交易量 $1M → **$2,000/天 = $730K/年**
- 费用留在金库中作为安全缓冲 + 管理员可提取

| 日交易量 | 年收入 | 回本周期（基于 $500K 种子轮） |
|-------------|----------------|---------------------------|
| $100K | $73K | 7 年 |
| $500K | $365K | 16 个月 |
| $1M | $730K | 8 个月 |
| $5M | $3.65M | 2 个月 |

---

## 技术栈

| 层级 | 技术 |
|-------|-----------|
| 区块链 | Solana（400ms 确认，$0.001/笔） |
| 智能合约 | Anchor 0.32.1 (Rust)，20 条指令 |
| 预言机 | Pyth Network（拉取式，400ms，4 个价格源） |
| 前端 | React 19 + Vite 7 + TypeScript |
| AI 交易 | MCP Server v2.0，11 个工具 |
| 形式化验证 | Lean 4 + Mathlib（8 个定理） |
| Keeper | Node.js (scripts/keeper.ts)，无需许可 |
| 托管 | holging.com (VPS + nginx + SSL) |

---

## 路线图

| 阶段 | 时间线 | 里程碑 |
|-------|----------|------------|
| **审计 + 主网** | Q1 2026 | 安全审计（OtterSec），Squads 多签，主网部署 |
| **增长** | Q2 2026 | Jupiter 聚合器，Orca AMM 池（SOL/shortSOL） |
| **多资产** | Q3 2026 | shortBTC、shortETH、shortGOLD |
| **自动化** | Q4 2026 | Holging Vault（自动 50/50 组合），治理代币 |

---

## 融资需求

**$500K 种子轮**分配：

| 类别 | 金额 | 用途 |
|----------|--------|---------|
| 安全审计 | $50K | OtterSec / Neodyme |
| 金库流动性 | $200K | 初始超额抵押 |
| 团队（6 个月） | $200K | 2 名工程师 |
| 法律 + 合规 | $50K | 监管框架 |

---

## 为什么是现在

- Solana DeFi TVL 持续增长，但对冲基础设施落后
- Friktion 已关闭 — 结构化产品赛道空缺
- Reflect 证明了需求（$50K Grand Prize）— 但对散户太复杂
- Holging = **"加密版 ProShares Short S&P 500" — 简单即胜利**

---

## 问答

### 产品

**问：为什么不直接卖掉 SOL？**
卖掉 SOL = 退出生态系统。shortSOL = 在生态系统内对冲。Holging（50% SOL + 50% shortSOL）让你在保持敞口的同时从波动中获利。shortSOL 是可组合的 SPL 代币 — 可用于 LP、流动性挖矿、DeFi 策略。

**问：这比 Drift/Jupiter 永续合约好在哪？**
不同的受众。永续合约 = 交易者（保证金、资金费率、清算监控）。Holging = 持有者（一键操作、钱包中的代币、零维护）。类比：ProShares Short S&P 500 (ETF) vs E-mini S&P 期货。

**问："Holging 永远赢" — 这不是太好了吗？**
已在 Lean 4 中数学证明（8 个定理）。从经济角度 — SOL 变动 ±9% 时盈亏平衡（0.40% 往返手续费）。日常 1-2% 的波动，利润 ≈ 零。该策略从**波动率**中获利 — 波动越大 = 盈亏越大。这是没有时间衰减的永续跨式期权。

**问：如果 SOL 下跌 80% 怎么办？**
shortSOL 上涨 5 倍。金库必须支付 5 倍。熔断机制在金库比率 < 95% 时暂停。解决方案：超额抵押。公式：若要防护 -80%，金库 = 5x TVL。动态费率在压力下自动增至 0.80%，减缓资金流出。

### 经济模型

**问：谁是对手方？**
金库由资金池支撑。初始由团队/基金超额抵押。费用（0.20–0.80%）作为安全缓冲累积。高交易量下，金库自我维持。V2：外部 LP，收益共享。

**问：流动性池如何注资？**
通过 `add_liquidity` 指令（仅管理员）。初始：基金种子资本。V2：无需许可的 LP 金库，费用收益共享。V3：Orca 上的 AMM 池（SOL/shortSOL）。

**问：为什么在金库比率低时不阻止 mint？**
Mint **补充**金库（用户存入 USDC）。阻止 mint = 阻止流动性流入。相反，动态费率让 mint 在低比率时**更便宜**，激励存款。

### 安全性

**问：审计情况如何？**
Devnet MVP。主网前计划审计（OtterSec/Neodyme，预算 $50K）。当前保护措施：全面的检查算术、4 层预言机验证、熔断机制、频率限制、金库对账、滑点保护、动态费率、资金费率、两步权限转移、16 个错误码。

**问：预言机操纵风险？**
Pyth Network 拉取式，400ms。4 层验证：时效性（120s）、置信度（<2%）、偏差（mint/redeem <15%，update_price <50%）、底价（$1）。频率限制（2 秒冷却）防止三明治攻击。`update_price` 不重置频率限制计时器。

**问：单一管理员密钥？**
两步 `transfer_authority` + `accept_authority` 已实现 — 新密钥必须签名确认。Squads v4 多签集成计划于 Q1 2026 主网前完成。

**问：熔断机制在用户最需要赎回时暂停？**
熔断机制防止挤兑 — 没有它，先赎回者拿走一切，其他人一无所获。类似 FDIC 保险 — 限制提款以保护所有人。解决方案：更深层的超额抵押（金库 ≥ 义务的 200-500%）。

### 技术

**问：为什么使用 Lean 4 进行形式化验证？**
Lean 4 是机器校验证明的行业标准（Microsoft、AWS 使用）。8 个定理证明 holging P&L ≥ 0、定价不变量、正 Gamma。Solana 上没有 DeFi 协议发布过形式化证明。这是审计和投资者信心的竞争优势。

**问：架构能否扩展到多资产？**
可以。`pool_id` 在所有 16 条指令中参数化。对于 shortBTC：新增 Pyth 价格源 + 前端池选择器。架构已就绪，代码改动 = 1 天。

### 市场

**问：Squeeth（Ethereum 反向 ETF）已关闭 — 你们为什么能成功？**
Squeeth 使用 x² 模型（有杠杆、路径依赖）。Holging 使用 1/x（无衰减、无路径依赖）。Squeeth 需要复杂基础设施和深度流动性。Holging 由金库支撑、零滑点、更简单的模型。不同的产品面向不同的市场。

**问：TAM/SAM/SOM？**
TAM：$47B（加密衍生品日交易量）。SAM：$2B（Solana 永续合约交易量）。SOM：$50M（一年目标，散户对冲 + holging）。按 0.40% 费率计算 = $50M 交易量下 $200K/年。
