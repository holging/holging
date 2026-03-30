# Holging — 主网上线准备清单

> 最后更新：2026-03-28
> 程序：`CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
> 网络：Solana Devnet → Mainnet-Beta

## 概述

本文档包含 Holging 上线主网之前需要完成的全部任务清单。每个条目都关联到具体的文件和代码行。

**统计：**
- **P0（必须完成）：** 8 项 — 阻塞上线（已完成 3 项）
- **P1（应当完成）：** 10 项 — 重要，但可在记录风险后上线
- **P2（最好完成）：** 7 项 — 上线后的改进

---

## 已完成（已部署至 devnet）

| 条目 | 描述 | 提交 | 日期 |
|------|------|------|------|
| ~~P0-1~~ | MAX_STALENESS_SECS: 120s → 30s | `0d3a2d7` | 2026-03-28 |
| ~~P0-3~~ | MAX_UPDATE_PRICE_DEVIATION_BPS: 5000 → 1500 | `0d3a2d7` | 2026-03-28 |
| ~~P0-2~~ | 在 initialize 中验证 usdc_mint.decimals == 6 | `0d3a2d7` | 2026-03-28 |
| — | LP 系统：add_liquidity、remove_liquidity、claim_lp_fees | `ec07d01` | 2026-03-28 |
| — | 19 项安全修复（3 项严重、6 项高危、7 项中等、4 项低危） | `ec07d01` | 2026-03-28 |
| — | 9 个链上集成测试 | `919cc7b` | 2026-03-28 |
| — | 池已迁移 + LP mint 已在 devnet 上初始化 | `f7b28c8` | 2026-03-28 |
| — | LP 仪表板 UI（存入/提取/领取） | `c855740` | 2026-03-28 |

---

## P0 — 必须完成（阻塞主网上线）

---

### P0-1. 将 MAX_STALENESS_SECS 降低至 30 秒

- **分类：** 预言机
- **文件：** `programs/holging/src/constants.rs:33`
- **内容：** 将 `MAX_STALENESS_SECS` 从 `120` 改为 `30`。在主网上 Pyth 每 ~400ms 发布一次价格，staleness 120s 意味着允许使用 2 分钟前的价格——对于金融协议来说不可接受。
- **原因：** 在 staleness 为 120s 的情况下，攻击者可以在高波动期间使用过时的价格进行 mint/redeem，从 vault 中套取套利利润。在 devnet 上 120s 是合理的，因为 Pyth 更新较少，但在主网上不可接受。
- **工作量：** 0.5h
- **完成条件：** constants.rs 中 `MAX_STALENESS_SECS = 30`，测试已更新（`tests/holging.ts:369` 中的安全属性测试检查 `<= 120`，需改为 `<= 30`）。

---

### P0-2. 在 initialize.rs 中验证 usdc_mint

- **分类：** 安全
- **文件：** `programs/holging/src/instructions/initialize.rs:46`
- **内容：** 在 `Initialize` 结构体中为 `usdc_mint` 账户添加约束 `address = <MAINNET_USDC_MINT>`。范围：仅限 initialize.rs——在 mint.rs/redeem.rs 中 vault PDA seeds 已包含 `usdc_mint.key()`，这已将 vault 绑定到特定的 mint。
- **原因：** 没有验证的话，可以使用假代币而非 USDC 来初始化池。Vault 将为该代币创建，所有后续操作都将使用它。虽然 mint/redeem 受 vault PDA seeds 保护，但使用任意 mint 创建池的行为打开了攻击向量（社会工程——用户看到 "Holging pool" 但 vault 中并非 USDC）。
- **工作量：** 1h
- **完成条件：** 在 `Initialize` 结构体中为 `usdc_mint` 添加约束 `#[account(address = MAINNET_USDC_MINT)]`。常量 `MAINNET_USDC_MINT` 已添加到 constants.rs 中。备选方案：通过 feature flag 支持 devnet/mainnet 切换。

---

### P0-3. 降低 MAX_UPDATE_PRICE_DEVIATION_BPS

- **分类：** 预言机
- **文件：** `programs/holging/src/constants.rs:45`
- **内容：** 将 `MAX_UPDATE_PRICE_DEVIATION_BPS` 从 `5000`（50%）降低到 `1500`（15%）。当前 50% 的值允许以巨大偏差更新价格缓存。
- **原因：** update_price（`instructions/update_price.rs:30`）是一个无需许可的指令。攻击者可以等到缓存价格偏差达 50% 后调用 update_price，设置"官方"缓存价格。然后后续的 mint/redeem 的偏差检查（15%）将基于这个被扭曲的基准。在主网 staleness 为 30s 的情况下，30s 内的价格差极少超过 15%。
- **工作量：** 0.5h
- **完成条件：** constants.rs 中 `MAX_UPDATE_PRICE_DEVIATION_BPS = 1500`。安全属性测试（`tests/holging.ts:379`）已更新。

---

### P0-4. 在 oracle.rs 中添加 Pyth feed ID 验证

- **分类：** 预言机
- **文件：** `programs/holging/src/oracle.rs:50-56`
- **内容：** 当前实现从十六进制字符串 `SOL_USD_FEED_ID`（`constants.rs:54`）解析 feed ID 并传递给 `get_price_no_older_than`。这是正确的，但 feed ID 字符串 `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` 应该与主网 Pyth 注册表进行验证。需添加确认注释和静态断言。
- **原因：** 错误的 feed ID 会导致程序读取其他资产（而非 SOL/USD）的价格。在主网上这是灾难性的错误。
- **工作量：** 1h
- **完成条件：** Feed ID 已通过 Pyth 主网注册表（https://pyth.network/developers/price-feed-ids）验证。已添加编译时或初始化时的断言。constants.rs 中的注释确认了验证日期。

---

### P0-5. 程序在主网上未设为不可变且未经验证

- **分类：** 运维
- **文件：** `Anchor.toml:8-9`、`programs/holging/Cargo.toml:1-5`
- **内容：** 主网部署前：(1) 通过 `anchor build --verifiable` 构建可验证版本，(2) 通过 `anchor deploy` 部署，(3) 通过 `anchor verify` 验证，(4) 决定升级权限策略（多签或不可变）。
- **原因：** 没有可验证构建，用户无法确认部署的字节码与源代码一致。没有升级权限决策——存在单点故障。
- **工作量：** 4h
- **完成条件：** 可验证构建无错误通过。部署脚本已记录。升级权限已转移至多签（见 P0-6）或程序已冻结（不可变）。

---

### P0-6. 权限——单密钥，无多签

- **分类：** 访问控制
- **文件：** `programs/holging/src/state.rs:4`（authority: Pubkey）、`programs/holging/src/instructions/pause.rs:14`、`instructions/withdraw_fees.rs:20`、`instructions/update_fee.rs:14`、`instructions/update_k.rs:14`
- **内容：** 所有管理操作（pause、withdraw_fees、update_fee、update_k、transfer_authority、update_funding_rate、update_min_lp_deposit）由单个 `authority` 密钥对控制。主网上线前需将权限转移至 Squads 多签（或类似方案）。
- **原因：** 单个密钥泄露 = 完全失去对协议的控制。Authority 可以：(1) 从 vault 提取所有管理费用，(2) 永久暂停池，(3) 将费率改为 1%，(4) 将权限转移给攻击者。多签需要 M-of-N 签名。
- **工作量：** 4h
- **完成条件：** 权限已转移至 Squads 多签（或类似方案）。最少 2-of-3 签名者。权限变更流程已记录。Transfer_authority + accept_authority 已使用多签测试。

---

### P0-7. 未进行安全审计

- **分类：** 安全
- **文件：** 整个代码库（`programs/holging/src/`）
- **内容：** 向知名 Solana 安全公司（OtterSec、Neodyme、Trail of Bits、Halborn）发起审计。范围：所有指令、预言机集成、数学运算、LP 系统。
- **原因：** 自我审查对于金融协议是不够的。审计人员能发现开发者容易忽略的漏洞类别（重入攻击、账户混淆、整数溢出模式）。审计报告是行业标准，对吸引 LP 至关重要。
- **工作量：** 2-4 周（外部流程）
- **完成条件：** 已收到审计报告。所有严重/高危发现已修复。报告已公开发布（或摘要）。

---

### P0-8. 主网部署配置

- **分类：** 运维
- **文件：** `Anchor.toml:8-19`
- **内容：** Anchor.toml 当前配置为 devnet（`cluster = "devnet"`）。需要：(1) 添加 `[programs.mainnet]` 区块，(2) 更新 `[provider]` 用于主网部署，(3) 使用主网 RPC 端点（非公共），(4) 如需新密钥对则更新 program ID。
- **原因：** 使用 devnet 配置部署至主网会导致错误或部署到错误的集群。
- **工作量：** 1h
- **完成条件：** `Anchor.toml` 包含 `[programs.mainnet]` 区块。部署脚本使用私有 RPC。钱包路径指向主网 authority。

---

## P1 — 应当完成（可在记录风险后上线）

---

### P1-1. LP 首位存款人攻击——死股份

- **分类：** LP 系统
- **文件：** `programs/holging/src/fees.rs:104-118`（calc_lp_shares）、`programs/holging/src/instructions/add_liquidity.rs:101`
- **内容：** 首次 LP 存款使用公式 `shares = usdc_amount`（1:1 引导，`fees.rs:109`）。经典 ERC-4626 攻击：首位存款人存入 1 wei，然后通过 USDC 转账直接向 vault "捐赠"大量资金，抬高 share 价格。后续存款人因舍入而获得 0 shares。
- **原因：** `MIN_LP_DEPOSIT = $100`（`constants.rs:78`）大幅提高了攻击成本（攻击者必须损失 $100 + 捐赠金额）。这使得攻击在合理金额范围内经济上不可行。尽管如此，为了完全防护，建议在首次存款时添加死股份。
- **工作量：** 2h
- **完成条件：** 首次 LP 存款时（total_supply == 0）额外铸造 1000 shares 到地址 `0x0..dead`（或等效地址）。或者：已记录风险接受说明，论证 MIN_LP_DEPOSIT=$100 足够。

---

### P1-2. claim_lp_fees：saturating_sub 可能掩盖数据不同步

- **分类：** LP 系统
- **文件：** `programs/holging/src/instructions/claim_lp_fees.rs:88`
- **内容：** 代码行 `pool.total_lp_fees_pending = pool.total_lp_fees_pending.saturating_sub(amount)` 使用 saturating_sub 而非 checked_sub。如果由于 bug 导致 total_lp_fees_pending < amount，下溢将被掩盖（结果为 0 而非报错）。
- **原因：** total_lp_fees_pending 是一个关键不变量：所有 position.pending_fees 的总和 <= total_lp_fees_pending。如果不变量被破坏，saturating_sub 会隐藏问题。使用 checked_sub 程序将返回错误，bug 会被立即发现。
- **工作量：** 0.5h
- **完成条件：** `saturating_sub` 替换为 `checked_sub` 并附加 `ok_or(error!(SolshortError::MathOverflow))`。已添加不变量测试：`sum(position.pending_fees) == pool.total_lp_fees_pending`。

---

### P1-3. 关键管理操作无时间锁

- **分类：** 访问控制
- **文件：** `programs/holging/src/instructions/update_fee.rs:22`、`instructions/update_k.rs:22`、`instructions/update_min_lp_deposit.rs:22`、`instructions/accrue_funding.rs:209-216`
- **内容：** 管理员可以即时：更改费率（最高 1%）、更改 k 值（当 circulating==0 时）、更改资金费率、更改最小 LP 存款额。没有时间锁——更改在同一区块内生效。
- **原因：** 即时参数变更对用户构成风险。如果权限被攻破（即使有多签），攻击者可以在一笔交易中更改参数并利用漏洞。时间锁为用户提供了反应时间。
- **工作量：** 8h（需要新的 PDA state 用于挂起的更改 + 延迟后执行）
- **完成条件：** 关键参数（fee_bps、funding_rate、min_lp_deposit）需要两步更新：提议 → 等待 24h → 执行。或者：已记录风险接受说明。

---

### P1-4. Keeper：无健康监控和告警

- **分类：** 监控
- **文件：** `scripts/keeper.ts:195-207`（runOnce 错误处理）
- **内容：** Keeper（`scripts/keeper.ts`）作为简单的 setInterval 循环运行。出错时仅 console.error。缺少：(1) 健康检查端点，(2) 失败时告警（Telegram/Discord/PagerDuty），(3) 指标（成功/失败调用次数），(4) vault 比率监控，(5) 预言机新鲜度监控。
- **原因：** 如果 keeper 崩溃，funding 将停止累积。在 MAX_FUNDING_ELAPSED_SECS=30 天（`constants.rs:14`）的情况下后果是延迟的，但如果没有监控，问题可能数周都不会被发现。Vault 比率可能在没有告警的情况下变得危急。
- **工作量：** 4h
- **完成条件：** Keeper 在以下情况发送告警：(1) 连续 3 次累积失败，(2) vault 比率 < 120%，(3) 预言机超过 5 分钟未更新，(4) keeper 重启。最低要求：Telegram/Discord webhook。

---

### P1-5. Keeper：无冗余和自动重启

- **分类：** 运维
- **文件：** `scripts/keeper.ts:149-212`
- **内容：** Keeper 以 `npx ts-node scripts/keeper.ts` 方式启动——简单的 Node.js 进程。缺少：systemd unit、Docker 容器、PM2 配置、健康检查、崩溃时自动重启。
- **原因：** 唯一的 keeper = 单点故障。在 OOM、崩溃或服务器重启时——funding 停止累积。
- **工作量：** 2h
- **完成条件：** Keeper 封装在 systemd service 中（或 Docker + 重启策略 + 健康检查）。部署/重启的 runbook 已记录。已考虑在第二台服务器上运行备份 keeper。

---

### P1-6. 缺少边界情况的集成测试

- **分类：** 测试
- **文件：** `tests/holging.ts:446-850+`
- **内容：** 当前集成测试覆盖正常路径：initialize → mint → redeem → LP add/remove。未覆盖：(1) redeem 时触发熔断器，(2) pause/unpause 流程，(3) transfer_authority + accept_authority，(4) 不同 elapsed 值的 accrue_funding，(5) claim_lp_fees，(6) 带有 vault 健康检查的 withdraw_fees，(7) 未授权访问尝试（反面测试），(8) 滑点保护（min_tokens_out / min_usdc_out），(9) 速率限制触发。
- **原因：** 正常路径测试无法捕获边界条件中的 bug。缺少反面测试意味着访问控制未在链上得到验证。
- **工作量：** 8h
- **完成条件：** 已添加测试：熔断器、暂停流程、权限转移、accrue_funding、claim_lp_fees、未授权访问（期望报错）、滑点拒绝。覆盖率：全部 20 条指令至少各有 1 个正常路径测试 + 1 个反面测试。

---

### P1-7. Keeper 的主网 RPC

- **分类：** 运维
- **文件：** `scripts/keeper.ts:21`
- **内容：** Keeper 默认使用 `https://api.devnet.solana.com`。主网需要私有 RPC（Helius、Triton、QuickNode），其速率限制需满足 keeper 循环需求。
- **原因：** 公共主网 RPC（`https://api.mainnet-beta.solana.com`）有严格的速率限制，可能拒绝 keeper 的交易。这将导致 funding 累积被跳过。
- **工作量：** 1h
- **完成条件：** `RPC_URL` 环境变量已记录为主网必需项。Keeper 配置包含备用 RPC。README 包含推荐的 RPC 供应商。

---

### P1-8. MAX_CONFIDENCE_PCT = 2% 可能过于严格

- **分类：** 预言机
- **文件：** `programs/holging/src/constants.rs:37`、`programs/holging/src/oracle.rs:108-111`
- **内容：** `MAX_CONFIDENCE_PCT = 2` 意味着如果 Pyth 置信区间 > 价格的 2%，预言机将被拒绝。在高波动期间，SOL 置信区间可能超过 2%，这将阻塞所有 mint/redeem 操作。
- **原因：** 过于严格的置信度检查 = 波动期间协议冻结。过于宽松 = 价格操纵风险。需要找到平衡。建议分析主网上 SOL/USD 的历史置信区间。
- **工作量：** 2h（数据分析 + 决策）
- **完成条件：** 已分析过去 6 个月 SOL/USD Pyth 历史置信区间。MAX_CONFIDENCE_PCT 已根据数据调整（2-5%）。已记录所选值的理由。

---

### P1-9. 缺少链上偿付能力不变量检查

- **分类：** LP 系统
- **文件：** `programs/holging/src/instructions/claim_lp_fees.rs:65`、`instructions/withdraw_fees.rs:56-76`
- **内容：** 没有统一的链上断言来验证：`vault_balance >= obligations + lp_principal + total_lp_fees_pending`。withdraw_fees 进行了部分检查（`instructions/withdraw_fees.rs:65-75`），但 claim_lp_fees 和 remove_liquidity 仅检查 `amount <= vault_balance`。
- **原因：** 全局偿付能力不变量被破坏 = 协议资不抵债。在每个涉及 vault 的操作中进行集中检查可确保尽早发现数据不同步。
- **工作量：** 4h
- **完成条件：** 在 fees.rs 中创建函数 `assert_vault_solvent(pool, vault_balance, sol_price)`。在 mint、redeem、add_liquidity、remove_liquidity、claim_lp_fees、withdraw_fees 结束时调用。测试确认不变量成立。

---

### P1-10. 前端：主网配置

- **分类：** 运维
- **文件：** `app/src/utils/program.ts`、`app/src/utils/pyth.ts`、`app/src/hooks/useSolshort.ts`
- **内容：** 前端配置为 devnet。主网需要：(1) 更新 RPC 端点，(2) 如有变更则更新 program ID，(3) 更新主网 Pyth price feed 账户，(4) 将 USDC mint 地址更新为主网地址（`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`）。
- **原因：** 使用 devnet 配置的前端在主网上 = 用户无法与协议交互。
- **工作量：** 2h
- **完成条件：** 前端通过环境变量支持 devnet/mainnet 切换。主网地址已记录。主网冒烟测试已通过。

---

## P2 — 最好完成（上线后）

---

### P2-1. 删除 migrate_pool 指令

- **分类：** 代码清理
- **文件：** `programs/holging/src/instructions/migrate_pool.rs:1-103`、`programs/holging/src/instructions/mod.rs:8`、`programs/holging/src/lib.rs:90-92`
- **内容：** `migrate_pool` 是一次性迁移，用于向现有 devnet 账户添加 LP 字段。使用硬编码偏移量（`migrate_pool.rs:93`：`min_deposit_offset = 8 + 205 + 64`）、`UncheckedAccount` 和手动字节写入。Devnet 池迁移完成后该指令不再需要。
- **原因：** (1) UncheckedAccount + 手动字节偏移 = 攻击面，(2) 硬编码偏移量在 PoolState 发生任何变更时将变得不正确，(3) 指令永久可用——任何持有 authority 的人都可以重复调用（虽然有 `current_len >= target_len` 检查）。
- **工作量：** 1h
- **完成条件：** migrate_pool 已从以下位置删除：instructions/migrate_pool.rs、instructions/mod.rs、lib.rs。IDL 已更新。IDL 验证测试（`tests/holging.ts:238`）已更新（19 条指令而非 20 条）。

---

### P2-2. 为 update_price 添加事件

- **分类：** 监控
- **文件：** `programs/holging/src/instructions/update_price.rs:41-47`
- **内容：** update_price 使用 `msg!()` 而非 `emit!()`。所有其他指令都发出结构化事件。update_price 是唯一的例外。
- **原因：** `msg!()` 记录更难被链下索引解析。通过 `emit!()` 的结构化事件允许通过事件订阅（Anchor 事件解析器、Yellowstone gRPC）高效跟踪价格更新。
- **工作量：** 1h
- **完成条件：** 在 events.rs 中添加 `UpdatePriceEvent { old_price, new_price, timestamp }`。update_price.rs 使用 `emit!()`。

---

### P2-3. 在 initialize 时添加 max_fee_bps 约束

- **分类：** 参数
- **文件：** `programs/holging/src/instructions/initialize.rs:60`
- **内容：** `require!(fee_bps <= 100, ...)` — 最大费率 1%。考虑在 initialize 时设置更严格的限制（例如 50 bps = 0.5%），仅在带有时间锁的 update_fee 中保留 100 bps。
- **原因：** 以 1% 费率初始化的池往返成本为 2%——对用户来说太贵了。创建时更严格的限制可防止操作失误。
- **工作量：** 0.5h
- **完成条件：** 初始化费率限制已降低，或已记录当前限制的理由。

---

### P2-4. 速率限制 MIN_ACTION_INTERVAL_SECS = 2s——考虑增加

- **分类：** 参数
- **文件：** `programs/holging/src/constants.rs:61`、`instructions/mint.rs:84-89`、`instructions/redeem.rs:79-86`
- **内容：** mint/redeem 之间的速率限制为 2 秒。检查使用池状态中的 `last_oracle_timestamp`——这是整个池的全局速率限制，而非每用户。
- **原因：** 在高活跃度下，一个用户可以为所有人阻塞 mint/redeem 2 秒。考虑每用户速率限制或减少到 1 个 slot（~400ms）。当前设计是权衡：简单性 vs 公平性。
- **工作量：** 4h（如果改为每用户）
- **完成条件：** 已记录决策：保持全局速率限制（简单性）或转为每用户（公平性）。如果每用户：添加用户特定的 PDA 用于追踪。

---

### P2-5. 添加只读指令用于链下查询

- **分类：** 运维
- **文件：** `programs/holging/src/lib.rs`
- **内容：** 添加只读指令：`get_shortsol_price(pool_id)`、`get_vault_health(pool_id)`、`get_lp_position_value(pool_id, owner)`。它们不修改状态，但允许链下客户端通过 simulate 获取计算值。
- **原因：** 目前链下客户端必须自行复制链上数学运算（shortsol_price、obligations、LP value）。View 指令保证一致性。
- **工作量：** 4h
- **完成条件：** 已添加 view 指令。前端使用它们替代本地数学运算。测试确认一致性。

---

### P2-6. 文档：紧急场景运维手册

- **分类：** 运维
- **文件：** 无（需要创建 `docs/RUNBOOK.md`）
- **内容：** 创建运维手册，包含以下场景的处理程序：(1) 紧急暂停——谁、如何、何时，(2) 预言机故障——预言机过期超过 5 分钟时的处理方法，(3) Vault 抵押不足——vault 比率 < 100% 时的步骤，(4) 密钥泄露——撤销 + 转移权限的流程，(5) Keeper 故障——手动 accrue_funding，(6) Bug 发现——分级处理 + 暂停 + 修复 + 重新部署。
- **原因：** 事故发生时没有时间研究代码。运维手册确保快速响应。
- **工作量：** 4h
- **完成条件：** `docs/RUNBOOK.md` 已创建，包含全部 6 个场景。每个场景包含：触发条件、分步操作、CLI 命令、回滚程序。

---

### P2-7. 法律：服务条款和免责声明

- **分类：** 法律/合规
- **文件：** 前端（app/）、README.md
- **内容：** 添加：(1) 协议使用服务条款，(2) 风险免责声明（shortSOL 不构成金融建议、损失风险、智能合约风险），(3) 管辖限制（如适用），(4) 隐私政策。
- **原因：** 为项目和用户提供法律保护。没有 ToS 的 DeFi 协议面临监管风险。
- **工作量：** 8h+（需要法律咨询）
- **完成条件：** ToS 已发布在网站上。免责声明在首次交互时可见。已获得法律咨询。

---

## 推荐执行顺序

```
阶段 1 — 预言机与安全（1-2 天）：
  P0-1  MAX_STALENESS_SECS → 30s
  P0-2  验证 usdc_mint
  P0-3  MAX_UPDATE_PRICE_DEVIATION_BPS → 1500
  P0-4  Pyth feed ID 验证
  P1-2  claim_lp_fees saturating_sub → checked_sub

阶段 2 — 访问控制与运维（2-3 天）：
  P0-6  为 authority 设置多签
  P0-5  可验证构建
  P0-8  主网部署配置
  P1-7  Keeper 的主网 RPC

阶段 3 — 测试与监控（3-5 天）：
  P1-6  边界情况集成测试
  P1-4  Keeper 监控与告警
  P1-5  Keeper 冗余

阶段 4 — 审计（2-4 周）：
  P0-7  安全审计

阶段 5 — 上线准备（1-2 天）：
  P1-8  置信区间分析
  P1-9  偿付能力不变量检查
  P1-10 前端主网配置

阶段 6 — 上线后（持续进行）：
  P2-1 .. P2-7
```

---

## 主网上线验收标准

所有 P0 项目必须完成（完成条件已满足）。P1 项目——已完成，或已记录附有理由的风险接受说明。

**上线最低要求：**
- [x] P0-1 预言机 staleness = 30s *（已完成：`0d3a2d7`）*
- [x] P0-2 USDC mint 已验证 *（已完成：`0d3a2d7`）*
- [x] P0-3 更新偏差 = 15% *（已完成：`0d3a2d7`）*
- [ ] P0-4 Feed ID 已验证
- [ ] P0-5 可验证构建
- [ ] P0-6 多签权限
- [ ] P0-7 安全审计已完成
- [ ] P0-8 主网部署配置
