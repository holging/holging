# Holging — Colosseum 黑客松分析

> 日期：2026-03-28 | 数据来源：Colosseum Copilot API（5,400+ 个项目）

---

## 1. 竞争格局

### 直接竞争对手：0

在 Colosseum 数据库中的 5,400+ 个项目中，没有任何一个实现了基于 Solana 的 **乘法式 1/x inverse token**。Holging 占据了独特的市场空间。

### 最接近的项目

| 项目 | 黑客松 | 机制 | 与 Holging 的区别 | 结果 |
|------|--------|------|---------------------|------|
| **[Squeeze](https://arena.colosseum.org/projects/explore/squeeze)** | Radar (Sep 2024) | 通过借贷 LP 仓位实现杠杆 | Lending-short，存在清算风险 | **DeFi 第1名**（$25K） |
| **[Reflect Protocol](https://arena.colosseum.org/projects/explore/reflect-protocol)** | Radar (Sep 2024) | 通过 LST + perps 实现 Delta 中性 | 依赖 perp DEX 的流动性 | **加速器 C2** |
| **[derp.trade](https://arena.colosseum.org/projects/explore/derp.trade)** | Breakout (Apr 2025) | 任意代币的永续合约互换 | AMM perps，非代币化 | 参赛项目 |
| **[Solistic Finance](https://arena.colosseum.org/projects/explore/solistic-finance)** | Breakout (Apr 2025) | 合成 RWA（股票、债券） | 不同资产类别 | 参赛项目 |
| **[Holo Synthetics](https://arena.colosseum.org/projects/explore/holo-(synthetics))** | Breakout (Apr 2025) | 无 KYC 的合成 RWA | 非 inverse exposure | 参赛项目 |
| **[Uranus DEX](https://arena.colosseum.org/projects/explore/uranus-dex)** | Cypherpunk (Sep 2025) | 任意链上资产的 P2P perps | 基于仓位，非 tokenized | 参赛项目 |
| **[SolHedge](https://arena.colosseum.org/projects/explore/solhedge)** | Breakout (Apr 2025) | AI 驱动的自动化交易 | 属于策略，而非工具 | 参赛项目 |

### 加速器与获奖项目验证

- **加速器：** 没有任何项目采用 inverse token 机制（Reflect Protocol 为 Delta 中性，属于不同方案）
- **获奖者：** Squeeze（DeFi 第1名，$25K）— 使用场景最接近，但机制截然不同（lending vs. tokenized inverse）

---

## 2. 存档研究

### 理论基础

| 来源 | 文档 | 相关性 |
|------|------|--------|
| Paradigm Research | [Everything Is A Perp](https://www.paradigm.xyz/2024/03/everything-is-a-perp) | 任何金融工具 = perp。Holging = 对用户无 funding 的 inverse perp |
| OtterSec | [The $200m Bluff: Cheating Oracles on Solana](https://osec.io/blog/2022-02-16-lp-token-oracle-manipulation) | Oracle manipulation 先例。Holging 有 4 层防护 |
| Galaxy Research | [DeFi's "Risk-Free" Rate](https://www.galaxy.com/insights/research/defis-risk-free-rate) | LP 收益基准。Holging 约 30-40% APY 具有竞争力 |
| Orca Docs | [Impermanent Loss](https://docs.orca.so/liquidity/concepts/impermanent-loss) | SOL/shortSOL 池通过反相关性消除 IL |
| Helius Blog | [Solana MEV Report](https://www.helius.dev/blog/solana-mev-report) | Solana 上的 MEV 攻击向量，与 oracle protection 相关 |
| Paradigm Research | [pm-AMM: Uniform AMM for Prediction Markets](https://www.paradigm.xyz/2024/11/pm-amm) | 针对反相关资产的 AMM 设计 |
| Drift Docs | [Perpetual Futures Hedging](https://docs.drift.trade/protocol/trading/perpetuals-trading) | 标准对冲方案（perps），Holging 更简单 |
| Superteam Blog | [Deep Dive: UXD Stablecoin](https://blog.superteam.fun/p/deep-dive-uxd-stablecoin) | 通过 perps 实现 Delta 中性 — 架构上最接近的类比 |

---

## 3. Pitch 对比

| 方面 | Holging | Squeeze（第1名） | Reflect（加速器） | Drift (Perps) |
|------|---------|--------------------|-----------------------|---------------|
| 清算 | **无** | 可能发生 | 无（Delta 中性） | 有 |
| 机制 | 1/x token | LP 借贷 | Cash-carry + perps | Order book perps |
| 用户复杂度 | **一键操作**（mint/redeem） | 需管理杠杆 | 自动化 | 保证金账户 |
| 可组合性 | **SPL token**（全链流通） | 仓位 | Token | 仓位 |
| Oracle | 仅 Pyth | AMM 价格 | 多个 DEX | 自有 |
| 数学证明 | **AM-GM 不等式** | 无 | 无 | 无 |
| Funding rate | 协议收取（10 bps/天） | 借款人支付 | LST 收益 | 多空互付 |
| LP 收益 | **约 30-40% APY** | 取决于需求 | 8-50%（宣称） | Maker fees |

---

## 4. 市场验证

### 已确认的需求

- **Squeeze** 在 Radar 黑客松中凭借 short exposure 赢得 **$25,000** → Solana 上对做空工具的需求**已得到验证**
- **Reflect Protocol** 凭借对冲方案进入**加速器 C2** → **投资者兴趣已得到确认**
- DeFi Trading 赛道的拥挤度：**323**（对 perps 而言偏高），但 inverse tokens 为 **0** → **蓝海市场**

### 独特性

Holging 是 Colosseum 5,400+ 个项目中唯一一个：
1. 将 inverse exposure 代币化为 SPL token
2. 采用乘法式 1/x 模型（非 Delta 对冲）
3. 通过数学方式保证 Holging 策略的 P&L ≥ 0（AM-GM 不等式）
4. 无需保证金、无清算、无到期日

---

## 5. 黑客松策略

### 推荐赛道：DeFi

理由：Squeeze 凭借类似的使用场景（short exposure）在 Radar 黑客松中获得 DeFi 第1名。

### Pitch（30 秒）

> Holging 是 Solana 版的 "ProShares Short S&P 500"。一键操作，即可获得一个在 SOL 下跌时升值的代币。无保证金、无清算、无到期日。而 50/50 SOL + shortSOL 策略通过 AM-GM 不等式在数学上保证任何方向的盈利。LP 通过 funding rate 赚取 30-40% APY。

### 面向评委的关键差异化优势

1. **数学保证** — AM-GM 不等式证明 50/50 组合的 P&L ≥ 0
2. **零清算** — 在所有竞争对手中独一无二（包括获奖项目 Squeeze）
3. **可用产品** — 已在 devnet 上线，100K USDC vault，LP Dashboard
4. **LP 系统** — permissionless，通过 k-decay funding rate 实现 30-40% APY
5. **无直接竞争对手** — Colosseum 5,400+ 个项目中独此一家
6. **Security audit** — 15 项发现（0 项 critical），4 层 oracle protection
7. **Lean 4 形式化证明** — 数学已验证

### 评委期望看到的内容（基于往届获奖经验）

| 标准 | Holging | 状态 |
|------|---------|------|
| 可运行的 Demo | holging.com | ✅ |
| 创新机制 | 1/x inverse token | ✅ |
| 安全性 | Audit + 4-layer oracle | ✅ |
| 经济模型 | Business Analysis 含具体数据 | ✅ |
| 代码质量 | 20 条指令，integration tests | ✅ |
| 文档 | README + PITCH + docs/ | ✅ |

---

## 6. 风险与应对

| 风险 | 严重程度 | 应对措施 |
|------|----------|----------|
| Oracle manipulation | 高 | 4 层验证（staleness 30s，confidence 2%，deviation 15%，floor $1） |
| LP 冷启动 | 中 | Funding rate 30.6% APY 无需交易量即可吸引首批 LP |
| 监管合规 | 中 | Inverse exposure 可能被视为衍生品，需法律咨询 |
| Vault 抵押不足 | 低 | 95% 时触发 Circuit breaker，admin withdrawal 需 ≥110% coverage |
| Keeper 停机 | 低 | MAX_FUNDING_ELAPSED_SECS = 30 天（carry-forward） |
| 智能合约漏洞 | 低 | 15 项 audit findings（0 项 critical），9 个 integration tests |

---

## 7. 提交前建议

### 必做事项
- [ ] 录制视频 Demo（Loom，3-5 分钟）：mint → redeem → LP deposit → claim fees
- [ ] 准备演示材料（幻灯片或视频 pitch）
- [ ] 确认 holging.com 运行稳定

### 建议事项
- [ ] 为 Holging 创建 Twitter/X 账号
- [ ] 向 vault 中增加 USDC 用于 Demo 展示
- [ ] 在 Demo 中展示 Holging strategy calculator（StrategyTerminal）

---

*分析通过 Colosseum Copilot API 完成。数据截至 2026-03-28。*
