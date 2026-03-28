# SolShort — Mainnet Readiness Checklist

> Последнее обновление: 2026-03-28
> Программа: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
> Сеть: Solana Devnet → Mainnet-Beta

## Обзор

Этот документ содержит полный список задач, которые необходимо выполнить перед запуском SolShort на mainnet. Каждый item привязан к конкретным файлам и строкам кода.

**Статистика:**
- **P0 (Must-have):** 8 items — блокируют launch (3 выполнено)
- **P1 (Should-have):** 10 items — важно, но можно launch с documented risk
- **P2 (Nice-to-have):** 7 items — улучшения для post-launch

---

## Выполнено (deployed on devnet)

| Item | Описание | Коммит | Дата |
|------|----------|--------|------|
| ~~P0-1~~ | MAX_STALENESS_SECS: 120s → 30s | `0d3a2d7` | 2026-03-28 |
| ~~P0-3~~ | MAX_UPDATE_PRICE_DEVIATION_BPS: 5000 → 1500 | `0d3a2d7` | 2026-03-28 |
| ~~P0-2~~ | Валидация usdc_mint.decimals == 6 в initialize | `0d3a2d7` | 2026-03-28 |
| — | LP system: add_liquidity, remove_liquidity, claim_lp_fees | `ec07d01` | 2026-03-28 |
| — | 19 security fixes (3 CRITICAL, 6 HIGH, 7 MEDIUM, 4 LOW) | `ec07d01` | 2026-03-28 |
| — | 9 on-chain integration tests | `919cc7b` | 2026-03-28 |
| — | Pool migrated + LP mint initialized on devnet | `f7b28c8` | 2026-03-28 |
| — | LP Dashboard UI (deposit/withdraw/claim) | `c855740` | 2026-03-28 |

---

## P0 — Must-Have (блокирует mainnet launch)

---

### P0-1. Уменьшить MAX_STALENESS_SECS до 30 секунд

- **Category:** Oracle
- **File(s):** `programs/solshort/src/constants.rs:33`
- **What:** Изменить `MAX_STALENESS_SECS` с `120` на `30`. На mainnet Pyth публикует цены каждые ~400ms, staleness 120s позволяет использовать цену 2-минутной давности — неприемлемо для финансового протокола.
- **Why:** При staleness 120s атакующий может mint/redeem с устаревшей ценой в момент высокой волатильности, извлекая арбитражную прибыль за счёт vault. На devnet 120s оправданы из-за редких обновлений Pyth, на mainnet — нет.
- **Effort:** 0.5h
- **Done when:** `MAX_STALENESS_SECS = 30` в constants.rs, тесты обновлены (security properties test в `tests/solshort.ts:369` проверяет `<= 120`, нужно `<= 30`).

---

### P0-2. Валидация usdc_mint в initialize.rs

- **Category:** Security
- **File(s):** `programs/solshort/src/instructions/initialize.rs:46`
- **What:** Добавить constraint `address = <MAINNET_USDC_MINT>` на аккаунт `usdc_mint` в `Initialize` struct. Scope: ТОЛЬКО initialize.rs — в mint.rs/redeem.rs vault PDA seeds включают `usdc_mint.key()`, что уже привязывает vault к конкретному mint.
- **Why:** Без валидации можно инициализировать пул с фейковым токеном вместо USDC. Vault будет создан для этого токена, и все последующие операции будут работать с ним. Хотя mint/redeem защищены vault PDA seeds, сам факт создания пула с произвольным mint открывает вектор атаки (social engineering — пользователь видит "SolShort pool" но vault содержит не USDC).
- **Effort:** 1h
- **Done when:** В `Initialize` struct добавлен constraint `#[account(address = MAINNET_USDC_MINT)]` на `usdc_mint`. Константа `MAINNET_USDC_MINT` добавлена в constants.rs. Вариант: параметр через feature flag для devnet/mainnet.

---

### P0-3. Уменьшить MAX_UPDATE_PRICE_DEVIATION_BPS

- **Category:** Oracle
- **File(s):** `programs/solshort/src/constants.rs:45`
- **What:** Уменьшить `MAX_UPDATE_PRICE_DEVIATION_BPS` с `5000` (50%) до `1500` (15%). Текущее значение 50% позволяет обновить кеш цены с огромным отклонением.
- **Why:** update_price (`instructions/update_price.rs:30`) — permissionless инструкция. Атакующий может дождаться момента, когда кешированная цена устарела на 50%, и вызвать update_price, установив "официальную" кешированную цену. Затем последующие mint/redeem с deviation check 15% будут работать от этой искажённой базы. При mainnet значении staleness 30s разница в цене за 30s крайне редко превышает 15%.
- **Effort:** 0.5h
- **Done when:** `MAX_UPDATE_PRICE_DEVIATION_BPS = 1500` в constants.rs. Тест security properties (`tests/solshort.ts:379`) обновлён.

---

### P0-4. Добавить Pyth feed ID validation в oracle.rs

- **Category:** Oracle
- **File(s):** `programs/solshort/src/oracle.rs:50-56`
- **What:** Текущая реализация парсит feed ID из hex-строки `SOL_USD_FEED_ID` (`constants.rs:54`) и передаёт в `get_price_no_older_than`. Это корректно, но feed ID строка `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` должна быть верифицирована против mainnet Pyth registry. Добавить комментарий-подтверждение и static assert.
- **Why:** Неверный feed ID приведёт к тому, что программа будет читать цену другого актива (не SOL/USD). На mainnet это катастрофическая ошибка.
- **Effort:** 1h
- **Done when:** Feed ID верифицирован через Pyth mainnet registry (https://pyth.network/developers/price-feed-ids). Добавлен compile-time или init-time assertion. Комментарий в constants.rs подтверждает верификацию с датой.

---

### P0-5. Программа не immutable и не verified на mainnet

- **Category:** Operations
- **File(s):** `Anchor.toml:8-9`, `programs/solshort/Cargo.toml:1-5`
- **What:** Перед mainnet deploy: (1) собрать verifiable build через `anchor build --verifiable`, (2) задеплоить через `anchor deploy`, (3) верифицировать через `anchor verify`, (4) решить вопрос upgrade authority (multisig или immutable).
- **Why:** Без verifiable build пользователи не могут подтвердить, что deployed bytecode соответствует исходному коду. Без решения по upgrade authority — single point of failure.
- **Effort:** 4h
- **Done when:** Verifiable build проходит без ошибок. Deploy script задокументирован. Upgrade authority переведён на multisig (см. P0-6) или программа заморожена (immutable).

---

### P0-6. Authority — single key, нет multisig

- **Category:** Access Control
- **File(s):** `programs/solshort/src/state.rs:4` (authority: Pubkey), `programs/solshort/src/instructions/pause.rs:14`, `instructions/withdraw_fees.rs:20`, `instructions/update_fee.rs:14`, `instructions/update_k.rs:14`
- **What:** Все admin-операции (pause, withdraw_fees, update_fee, update_k, transfer_authority, update_funding_rate, update_min_lp_deposit) контролируются одним `authority` keypair. Необходимо перевести authority на Squads multisig (или аналог) перед mainnet.
- **Why:** Компрометация одного ключа = полная потеря контроля над протоколом. Authority может: (1) снять все admin fees из vault, (2) поставить pool на паузу навсегда, (3) изменить fee на 1%, (4) передать authority злоумышленнику. Multisig требует M-of-N подписей.
- **Effort:** 4h
- **Done when:** Authority переведён на Squads multisig (или аналог). Минимум 2-of-3 подписантов. Процедура смены authority задокументирована. Transfer_authority + accept_authority протестированы с multisig.

---

### P0-7. Нет аудита безопасности

- **Category:** Security
- **File(s):** Весь codebase (`programs/solshort/src/`)
- **What:** Заказать аудит у одной из признанных Solana security фирм (OtterSec, Neodyme, Trail of Bits, Halborn). Scope: все instructions, oracle integration, math, LP system.
- **Why:** Self-review недостаточен для финансового протокола. Аудиторы находят классы уязвимостей (reentrancy, account confusion, integer overflow patterns), которые разработчики пропускают. Наличие аудит-отчёта — стандарт индустрии и критически важен для привлечения LP.
- **Effort:** 2-4 недели (внешний процесс)
- **Done when:** Аудит-отчёт получен. Все critical/high findings исправлены. Отчёт опубликован (или summary).

---

### P0-8. Mainnet deploy configuration

- **Category:** Operations
- **File(s):** `Anchor.toml:8-19`
- **What:** Anchor.toml сейчас настроен на devnet (`cluster = "devnet"`). Необходимо: (1) добавить `[programs.mainnet]` секцию, (2) обновить `[provider]` для mainnet deploy, (3) использовать mainnet RPC endpoint (не публичный), (4) обновить program ID если нужна новая keypair.
- **Why:** Деплой на mainnet с devnet конфигурацией приведёт к ошибкам или деплою не на тот кластер.
- **Effort:** 1h
- **Done when:** `Anchor.toml` содержит `[programs.mainnet]` секцию. Deploy script использует приватный RPC. Wallet path указывает на mainnet authority.

---

## P1 — Should-Have (запуск возможен с documented risk)

---

### P1-1. LP first-depositor attack — dead shares

- **Category:** LP System
- **File(s):** `programs/solshort/src/fees.rs:104-118` (calc_lp_shares), `programs/solshort/src/instructions/add_liquidity.rs:101`
- **What:** Первый LP депозит использует формулу `shares = usdc_amount` (1:1 bootstrap, `fees.rs:109`). Классическая ERC-4626 атака: первый depositor вносит 1 wei, затем "donates" большую сумму напрямую в vault (через USDC transfer), раздувая цену share. Последующие depositors получают 0 shares из-за rounding.
- **Why:** `MIN_LP_DEPOSIT = $100` (`constants.rs:78`) значительно повышает стоимость атаки (атакующий должен потерять $100+donation). Это делает атаку экономически нецелесообразной для разумных сумм. Тем не менее, для полной защиты рекомендуется добавить dead shares при первом депозите.
- **Effort:** 2h
- **Done when:** При первом LP deposit (total_supply == 0) минтятся дополнительные 1000 shares на адрес `0x0..dead` (или эквивалент). Либо: задокументирован risk acceptance с обоснованием что MIN_LP_DEPOSIT=$100 достаточно.

---

### P1-2. claim_lp_fees: saturating_sub может маскировать десинхронизацию

- **Category:** LP System
- **File(s):** `programs/solshort/src/instructions/claim_lp_fees.rs:88`
- **What:** Строка `pool.total_lp_fees_pending = pool.total_lp_fees_pending.saturating_sub(amount)` использует saturating_sub вместо checked_sub. Если total_lp_fees_pending < amount из-за бага, underflow будет замаскирован (результат = 0 вместо ошибки).
- **Why:** total_lp_fees_pending — критический инвариант: сумма всех position.pending_fees <= total_lp_fees_pending. Если инвариант нарушен, saturating_sub скрывает проблему. С checked_sub программа вернёт ошибку, и баг будет обнаружен сразу.
- **Effort:** 0.5h
- **Done when:** `saturating_sub` заменён на `checked_sub` с `ok_or(error!(SolshortError::MathOverflow))`. Добавлен тест на invariant: `sum(position.pending_fees) == pool.total_lp_fees_pending`.

---

### P1-3. Нет timelock на критические admin операции

- **Category:** Access Control
- **File(s):** `programs/solshort/src/instructions/update_fee.rs:22`, `instructions/update_k.rs:22`, `instructions/update_min_lp_deposit.rs:22`, `instructions/accrue_funding.rs:209-216`
- **What:** Admin может мгновенно: изменить fee (до 1%), изменить k (при circulating==0), изменить funding rate, изменить min_lp_deposit. Нет timelock — изменения применяются в том же блоке.
- **Why:** Мгновенные изменения параметров — risk для пользователей. Если authority compromised (даже с multisig), злоумышленник может изменить параметры и exploit в одной транзакции. Timelock даёт пользователям время на реакцию.
- **Effort:** 8h (новый PDA state для pending changes + execute after delay)
- **Done when:** Критические параметры (fee_bps, funding_rate, min_lp_deposit) требуют двухшаговое обновление: propose → wait 24h → execute. Либо: задокументирован risk acceptance.

---

### P1-4. Keeper: нет health monitoring и alerting

- **Category:** Monitoring
- **File(s):** `scripts/keeper.ts:195-207` (runOnce error handling)
- **What:** Keeper (`scripts/keeper.ts`) работает как простой setInterval loop. При ошибке — только console.error. Нет: (1) health check endpoint, (2) alert при failure (Telegram/Discord/PagerDuty), (3) метрик (успешные/неуспешные вызовы), (4) мониторинга vault ratio, (5) мониторинга oracle freshness.
- **Why:** Если keeper упадёт, funding перестанет начисляться. При MAX_FUNDING_ELAPSED_SECS=30 дней (`constants.rs:14`) последствия отложены, но без мониторинга проблема может не обнаружиться неделями. Vault ratio может стать критическим без alerts.
- **Effort:** 4h
- **Done when:** Keeper отправляет alerts при: (1) 3 подряд failed accrual, (2) vault ratio < 120%, (3) oracle не обновлялся > 5 минут, (4) keeper restart. Минимум: Telegram/Discord webhook.

---

### P1-5. Keeper: нет redundancy и auto-restart

- **Category:** Operations
- **File(s):** `scripts/keeper.ts:149-212`
- **What:** Keeper запускается как `npx ts-node scripts/keeper.ts` — простой Node.js процесс. Нет: systemd unit, Docker container, PM2 config, health check, auto-restart при crash.
- **Why:** Единственный keeper = single point of failure. При OOM, crash, или reboot сервера — funding перестаёт начисляться.
- **Effort:** 2h
- **Done when:** Keeper обёрнут в systemd service (или Docker + restart policy + healthcheck). Задокументирован runbook для deploy/restart. Рассмотрен backup keeper на втором сервере.

---

### P1-6. Нет integration тестов для edge cases

- **Category:** Testing
- **File(s):** `tests/solshort.ts:446-850+`
- **What:** Текущие integration тесты покрывают happy path: initialize → mint → redeem → LP add/remove. Не покрыты: (1) circuit breaker trigger при redeem, (2) pause/unpause flow, (3) transfer_authority + accept_authority, (4) accrue_funding с разными elapsed, (5) claim_lp_fees, (6) withdraw_fees с vault health check, (7) unauthorized access attempts (negative tests), (8) slippage protection (min_tokens_out / min_usdc_out), (9) rate limit trigger.
- **Why:** Happy path тесты не ловят баги в граничных условиях. Отсутствие negative tests означает, что access control не верифицирован on-chain.
- **Effort:** 8h
- **Done when:** Добавлены тесты для: circuit breaker, pause flow, authority transfer, accrue_funding, claim_lp_fees, unauthorized access (expect error), slippage rejection. Покрытие: все 20 instructions имеют хотя бы 1 happy path + 1 negative test.

---

### P1-7. Mainnet RPC для keeper

- **Category:** Operations
- **File(s):** `scripts/keeper.ts:21`
- **What:** Keeper использует `https://api.devnet.solana.com` по умолчанию. Для mainnet нужен приватный RPC (Helius, Triton, QuickNode) с rate limits достаточными для keeper loop.
- **Why:** Публичный mainnet RPC (`https://api.mainnet-beta.solana.com`) имеет жёсткие rate limits и может отклонять транзакции keeper. Это приведёт к пропуску funding accruals.
- **Effort:** 1h
- **Done when:** `RPC_URL` env variable задокументирована как обязательная для mainnet. Keeper config включает fallback RPC. README содержит рекомендованные RPC провайдеры.

---

### P1-8. MAX_CONFIDENCE_PCT = 2% может быть слишком строгим

- **Category:** Oracle
- **File(s):** `programs/solshort/src/constants.rs:37`, `programs/solshort/src/oracle.rs:108-111`
- **What:** `MAX_CONFIDENCE_PCT = 2` означает, что если confidence interval Pyth > 2% от цены, oracle отклоняется. В периоды высокой волатильности SOL confidence interval может превышать 2%, что заблокирует все mint/redeem операции.
- **Why:** Слишком строгий confidence check = protocol freeze при волатильности. Слишком мягкий = risk манипуляции ценой. Нужен баланс. Рекомендуется проанализировать исторические confidence intervals SOL/USD на mainnet.
- **Effort:** 2h (анализ данных + решение)
- **Done when:** Проанализированы исторические confidence intervals SOL/USD Pyth за последние 6 месяцев. Значение MAX_CONFIDENCE_PCT скорректировано на основе данных (2-5%). Задокументировано обоснование выбранного значения.

---

### P1-9. Нет on-chain solvency invariant check

- **Category:** LP System
- **File(s):** `programs/solshort/src/instructions/claim_lp_fees.rs:65`, `instructions/withdraw_fees.rs:56-76`
- **What:** Нет единого on-chain assert, который проверяет: `vault_balance >= obligations + lp_principal + total_lp_fees_pending`. withdraw_fees проверяет частично (`instructions/withdraw_fees.rs:65-75`), но claim_lp_fees и remove_liquidity проверяют только `amount <= vault_balance`.
- **Why:** Нарушение глобального solvency invariant = протокол неплатёжеспособен. Централизованная проверка в каждой операции, затрагивающей vault, гарантирует раннее обнаружение десинхронизации.
- **Effort:** 4h
- **Done when:** Создана функция `assert_vault_solvent(pool, vault_balance, sol_price)` в fees.rs. Вызывается в конце mint, redeem, add_liquidity, remove_liquidity, claim_lp_fees, withdraw_fees. Тест подтверждает что инвариант держится.

---

### P1-10. Frontend: mainnet configuration

- **Category:** Operations
- **File(s):** `app/src/utils/program.ts`, `app/src/utils/pyth.ts`, `app/src/hooks/useSolshort.ts`
- **What:** Frontend настроен на devnet. Для mainnet: (1) обновить RPC endpoint, (2) обновить program ID если изменился, (3) обновить Pyth price feed account для mainnet, (4) обновить USDC mint address на mainnet (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
- **Why:** Frontend с devnet config на mainnet = пользователи не смогут взаимодействовать с протоколом.
- **Effort:** 2h
- **Done when:** Frontend поддерживает переключение devnet/mainnet через env variable. Mainnet addresses задокументированы. Smoke test на mainnet пройден.

---

## P2 — Nice-to-Have (post-launch)

---

### P2-1. Удалить migrate_pool instruction

- **Category:** Code Cleanup
- **File(s):** `programs/solshort/src/instructions/migrate_pool.rs:1-103`, `programs/solshort/src/instructions/mod.rs:8`, `programs/solshort/src/lib.rs:90-92`
- **What:** `migrate_pool` — одноразовая миграция для добавления LP полей в существующие devnet аккаунты. Использует hardcoded offsets (`migrate_pool.rs:93`: `min_deposit_offset = 8 + 205 + 64`), `UncheckedAccount`, и ручную запись байт. После миграции devnet пулов эта инструкция не нужна.
- **Why:** (1) UncheckedAccount + ручные byte offsets = attack surface, (2) hardcoded offsets станут неверными при любом изменении PoolState, (3) инструкция доступна навсегда — кто угодно с authority может вызвать повторно (хотя есть check `current_len >= target_len`).
- **Effort:** 1h
- **Done when:** migrate_pool удалён из: instructions/migrate_pool.rs, instructions/mod.rs, lib.rs. IDL обновлён. Тест IDL validation (`tests/solshort.ts:238`) обновлён (19 instructions вместо 20).

---

### P2-2. Добавить event для update_price

- **Category:** Monitoring
- **File(s):** `programs/solshort/src/instructions/update_price.rs:41-47`
- **What:** update_price использует `msg!()` вместо `emit!()`. Все остальные instructions эмитят structured events. update_price — единственное исключение.
- **Why:** `msg!()` записи сложнее парсить для off-chain индексации. Structured events через `emit!()` позволяют эффективно отслеживать price updates через event subscription (Anchor event parser, Yellowstone gRPC).
- **Effort:** 1h
- **Done when:** Добавлен `UpdatePriceEvent { old_price, new_price, timestamp }` в events.rs. update_price.rs использует `emit!()`.

---

### P2-3. Добавить max_fee_bps constraint при initialize

- **Category:** Parameters
- **File(s):** `programs/solshort/src/instructions/initialize.rs:60`
- **What:** `require!(fee_bps <= 100, ...)` — max fee 1%. Рассмотреть более строгий лимит для initialize (например, 50 bps = 0.5%) и оставить 100 bps только для update_fee с timelock.
- **Why:** Пул, инициализированный с fee 1%, имеет roundtrip cost 2% — дорого для пользователей. Более строгий лимит при создании защищает от ошибки.
- **Effort:** 0.5h
- **Done when:** Init fee limit снижен или задокументировано обоснование текущего лимита.

---

### P2-4. Rate limit MIN_ACTION_INTERVAL_SECS = 2s — рассмотреть увеличение

- **Category:** Parameters
- **File(s):** `programs/solshort/src/constants.rs:61`, `instructions/mint.rs:84-89`, `instructions/redeem.rs:79-86`
- **What:** Rate limit 2 секунды между mint/redeem. Проверка использует `last_oracle_timestamp` из pool state — это глобальный rate limit на весь пул, не per-user.
- **Why:** При высокой активности один пользователь может заблокировать mint/redeem для всех на 2 секунды. Рассмотреть per-user rate limit или уменьшение до 1 слота (~400ms). Текущий дизайн — trade-off: простота vs fairness.
- **Effort:** 4h (если менять на per-user)
- **Done when:** Задокументировано решение: оставить глобальный rate limit (простота) или перейти на per-user (fairness). Если per-user: добавить user-specific PDA для tracking.

---

### P2-5. Добавить view-only instructions для off-chain queries

- **Category:** Operations
- **File(s):** `programs/solshort/src/lib.rs`
- **What:** Добавить read-only instructions: `get_shortsol_price(pool_id)`, `get_vault_health(pool_id)`, `get_lp_position_value(pool_id, owner)`. Они не мутируют state, но позволяют off-chain клиентам получать вычисленные значения через simulate.
- **Why:** Сейчас off-chain клиенты должны самостоятельно реплицировать on-chain math (shortsol_price, obligations, LP value). View instructions гарантируют consistency.
- **Effort:** 4h
- **Done when:** Добавлены view instructions. Frontend использует их вместо local math. Тесты подтверждают consistency.

---

### P2-6. Документация: runbook для emergency scenarios

- **Category:** Operations
- **File(s):** Нет (нужно создать `docs/RUNBOOK.md`)
- **What:** Создать operational runbook с процедурами для: (1) Emergency pause — кто, как, когда, (2) Oracle failure — что делать при stale oracle > 5 минут, (3) Vault undercollateralization — steps при vault ratio < 100%, (4) Key compromise — процедура revoke + transfer authority, (5) Keeper failure — manual accrue_funding, (6) Bug discovery — triage + pause + fix + redeploy.
- **Why:** В момент инцидента нет времени разбираться в коде. Runbook обеспечивает быструю реакцию.
- **Effort:** 4h
- **Done when:** `docs/RUNBOOK.md` создан со всеми 6 сценариями. Каждый сценарий содержит: trigger condition, step-by-step actions, CLI commands, rollback procedure.

---

### P2-7. Legal: Terms of Service и Disclaimers

- **Category:** Legal / Compliance
- **File(s):** Frontend (app/), README.md
- **What:** Добавить: (1) Terms of Service для использования протокола, (2) Risk disclaimers (shortSOL не является financial advice, risk of loss, smart contract risk), (3) Jurisdictional restrictions (если применимо), (4) Privacy policy.
- **Why:** Юридическая защита проекта и пользователей. DeFi протоколы без ToS подвержены regulatory risk.
- **Effort:** 8h+ (требует юридической консультации)
- **Done when:** ToS опубликованы на сайте. Disclaimers видны при первом взаимодействии. Юридическая консультация получена.

---

## Порядок выполнения (рекомендованный)

```
Фаза 1 — Oracle & Security (1-2 дня):
  P0-1  MAX_STALENESS_SECS → 30s
  P0-2  Валидация usdc_mint
  P0-3  MAX_UPDATE_PRICE_DEVIATION_BPS → 1500
  P0-4  Pyth feed ID verification
  P1-2  claim_lp_fees saturating_sub → checked_sub

Фаза 2 — Access Control & Ops (2-3 дня):
  P0-6  Multisig для authority
  P0-5  Verifiable build
  P0-8  Mainnet deploy config
  P1-7  Mainnet RPC для keeper

Фаза 3 — Testing & Monitoring (3-5 дней):
  P1-6  Integration тесты edge cases
  P1-4  Keeper monitoring & alerting
  P1-5  Keeper redundancy

Фаза 4 — Audit (2-4 недели):
  P0-7  Security audit

Фаза 5 — Launch prep (1-2 дня):
  P1-8  Confidence interval analysis
  P1-9  Solvency invariant check
  P1-10 Frontend mainnet config

Фаза 6 — Post-launch (ongoing):
  P2-1 .. P2-7
```

---

## Acceptance Criteria для Mainnet Launch

Все P0 items ДОЛЖНЫ быть завершены (Done when условия выполнены). P1 items — или завершены, или задокументирован risk acceptance с обоснованием.

**Минимальный набор для launch:**
- [x] P0-1 Oracle staleness = 30s *(done: `0d3a2d7`)*
- [x] P0-2 USDC mint validated *(done: `0d3a2d7`)*
- [x] P0-3 Update deviation = 15% *(done: `0d3a2d7`)*
- [ ] P0-4 Feed ID verified
- [ ] P0-5 Verifiable build
- [ ] P0-6 Multisig authority
- [ ] P0-7 Security audit completed
- [ ] P0-8 Mainnet deploy config
