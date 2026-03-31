# Holging — Mainnet Readiness Checklist

> Last updated: 2026-03-28
> Program: `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`
> Network: Solana Devnet → Mainnet-Beta

## Overview

This document contains a complete list of tasks that must be completed before launching Holging on mainnet. Each item is tied to specific files and lines of code.

**Statistics:**
- **P0 (Must-have):** 8 items — block launch (3 completed)
- **P1 (Should-have):** 10 items — important, but launch is possible with documented risk
- **P2 (Nice-to-have):** 7 items — improvements for post-launch

---

## Completed (deployed on devnet)

| Item | Description | Commit | Date |
|------|-------------|--------|------|
| ~~P0-1~~ | MAX_STALENESS_SECS: 120s → 30s | `0d3a2d7` | 2026-03-28 |
| ~~P0-3~~ | MAX_UPDATE_PRICE_DEVIATION_BPS: 5000 → 1500 | `0d3a2d7` | 2026-03-28 |
| ~~P0-2~~ | Validation of usdc_mint.decimals == 6 in initialize | `0d3a2d7` | 2026-03-28 |
| — | LP system: add_liquidity, remove_liquidity, claim_lp_fees | `ec07d01` | 2026-03-28 |
| — | 19 security fixes (3 CRITICAL, 6 HIGH, 7 MEDIUM, 4 LOW) | `ec07d01` | 2026-03-28 |
| — | 9 on-chain integration tests | `919cc7b` | 2026-03-28 |
| — | Pool migrated + LP mint initialized on devnet | `f7b28c8` | 2026-03-28 |
| — | LP Dashboard UI (deposit/withdraw/claim) | `c855740` | 2026-03-28 |

---

## P0 — Must-Have (blocks mainnet launch)

---

### P0-1. Reduce MAX_STALENESS_SECS to 30 seconds

- **Category:** Oracle
- **File(s):** `programs/holging/src/constants.rs:33`
- **What:** Change `MAX_STALENESS_SECS` from `120` to `30`. On mainnet, Pyth publishes prices every ~400ms; a staleness of 120s allows using a 2-minute-old price — unacceptable for a financial protocol.
- **Why:** With staleness of 120s, an attacker can mint/redeem with a stale price during high volatility, extracting arbitrage profit at the vault's expense. On devnet, 120s is justified due to infrequent Pyth updates; on mainnet, it is not.
- **Effort:** 0.5h
- **Done when:** `MAX_STALENESS_SECS = 30` in constants.rs, tests updated (security properties test in `tests/holging.ts:369` checks `<= 120`, needs `<= 30`).

---

### P0-2. Validate usdc_mint in initialize.rs

- **Category:** Security
- **File(s):** `programs/holging/src/instructions/initialize.rs:46`
- **What:** Add constraint `address = <MAINNET_USDC_MINT>` on the `usdc_mint` account in the `Initialize` struct. Scope: ONLY initialize.rs — in mint.rs/redeem.rs, vault PDA seeds include `usdc_mint.key()`, which already binds the vault to a specific mint.
- **Why:** Without validation, a pool can be initialized with a fake token instead of USDC. The vault will be created for that token, and all subsequent operations will work with it. Although mint/redeem are protected by vault PDA seeds, the fact that a pool can be created with an arbitrary mint opens an attack vector (social engineering — the user sees "Holging pool" but the vault contains non-USDC).
- **Effort:** 1h
- **Done when:** The `Initialize` struct has a constraint `#[account(address = MAINNET_USDC_MINT)]` on `usdc_mint`. The constant `MAINNET_USDC_MINT` is added to constants.rs. Alternative: parameter via feature flag for devnet/mainnet.

---

### P0-3. Reduce MAX_UPDATE_PRICE_DEVIATION_BPS

- **Category:** Oracle
- **File(s):** `programs/holging/src/constants.rs:45`
- **What:** Reduce `MAX_UPDATE_PRICE_DEVIATION_BPS` from `5000` (50%) to `1500` (15%). The current value of 50% allows updating the price cache with a huge deviation.
- **Why:** update_price (`instructions/update_price.rs:30`) is a permissionless instruction. An attacker can wait for the moment when the cached price is stale by 50%, then call update_price to set the "official" cached price. Subsequent mint/redeem operations with a deviation check of 15% will then operate from this distorted base. With a mainnet staleness value of 30s, a price difference exceeding 15% within 30s is extremely rare.
- **Effort:** 0.5h
- **Done when:** `MAX_UPDATE_PRICE_DEVIATION_BPS = 1500` in constants.rs. Security properties test (`tests/holging.ts:379`) updated.

---

### P0-4. Add Pyth feed ID validation in oracle.rs

- **Category:** Oracle
- **File(s):** `programs/holging/src/oracle.rs:50-56`
- **What:** The current implementation parses the feed ID from the hex string `SOL_USD_FEED_ID` (`constants.rs:54`) and passes it to `get_price_no_older_than`. This is correct, but the feed ID string `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` must be verified against the mainnet Pyth registry. Add a confirmation comment and a static assert.
- **Why:** An incorrect feed ID will cause the program to read the price of a different asset (not SOL/USD). On mainnet, this is a catastrophic error.
- **Effort:** 1h
- **Done when:** Feed ID verified against the Pyth mainnet registry (https://pyth.network/developers/price-feed-ids). A compile-time or init-time assertion added. A comment in constants.rs confirms verification with the date.

---

### P0-5. Program is not immutable and not verified on mainnet

- **Category:** Operations
- **File(s):** `Anchor.toml:8-9`, `programs/holging/Cargo.toml:1-5`
- **What:** Before mainnet deploy: (1) produce a verifiable build via `anchor build --verifiable`, (2) deploy via `anchor deploy`, (3) verify via `anchor verify`, (4) decide on upgrade authority (multisig or immutable).
- **Why:** Without a verifiable build, users cannot confirm that the deployed bytecode matches the source code. Without a decision on upgrade authority — single point of failure.
- **Effort:** 4h
- **Done when:** Verifiable build passes without errors. Deploy script is documented. Upgrade authority transferred to multisig (see P0-6) or program frozen (immutable).

---

### P0-6. Authority — single key, no multisig

- **Category:** Access Control
- **File(s):** `programs/holging/src/state.rs:4` (authority: Pubkey), `programs/holging/src/instructions/pause.rs:14`, `instructions/withdraw_fees.rs:20`, `instructions/update_fee.rs:14`, `instructions/update_k.rs:14`
- **What:** All admin operations (pause, withdraw_fees, update_fee, update_k, transfer_authority, update_funding_rate, update_min_lp_deposit) are controlled by a single `authority` keypair. The authority must be transferred to a Squads multisig (or equivalent) before mainnet.
- **Why:** Compromise of a single key = complete loss of control over the protocol. Authority can: (1) withdraw all admin fees from the vault, (2) pause the pool permanently, (3) change the fee to 1%, (4) transfer authority to a malicious actor. Multisig requires M-of-N signatures.
- **Effort:** 4h
- **Done when:** Authority transferred to a Squads multisig (or equivalent). Minimum 2-of-3 signers. Authority transfer procedure documented. Transfer_authority + accept_authority tested with multisig.

---

### P0-7. No security audit

- **Category:** Security
- **File(s):** Entire codebase (`programs/holging/src/`)
- **What:** Commission an audit from a recognized Solana security firm (OtterSec, Neodyme, Trail of Bits, Halborn). Scope: all instructions, oracle integration, math, LP system.
- **Why:** Self-review is insufficient for a financial protocol. Auditors find classes of vulnerabilities (reentrancy, account confusion, integer overflow patterns) that developers miss. Having an audit report is an industry standard and critically important for attracting LPs.
- **Effort:** 2–4 weeks (external process)
- **Done when:** Audit report received. All critical/high findings fixed. Report published (or summary).

---

### P0-8. Mainnet deploy configuration

- **Category:** Operations
- **File(s):** `Anchor.toml:8-19`
- **What:** Anchor.toml is currently configured for devnet (`cluster = "devnet"`). Required: (1) add a `[programs.mainnet]` section, (2) update `[provider]` for mainnet deploy, (3) use a mainnet RPC endpoint (not public), (4) update program ID if a new keypair is needed.
- **Why:** Deploying to mainnet with devnet configuration will cause errors or deployment to the wrong cluster.
- **Effort:** 1h
- **Done when:** `Anchor.toml` contains a `[programs.mainnet]` section. Deploy script uses a private RPC. Wallet path points to the mainnet authority.

---

## P1 — Should-Have (launch possible with documented risk)

---

### P1-1. LP first-depositor attack — dead shares

- **Category:** LP System
- **File(s):** `programs/holging/src/fees.rs:104-118` (calc_lp_shares), `programs/holging/src/instructions/add_liquidity.rs:101`
- **What:** The first LP deposit uses the formula `shares = usdc_amount` (1:1 bootstrap, `fees.rs:109`). Classic ERC-4626 attack: the first depositor deposits 1 wei, then "donates" a large amount directly to the vault (via USDC transfer), inflating the share price. Subsequent depositors receive 0 shares due to rounding.
- **Why:** `MIN_LP_DEPOSIT = $100` (`constants.rs:78`) significantly raises the cost of the attack (the attacker must lose $100 + donation). This makes the attack economically infeasible for reasonable amounts. Nevertheless, for full protection, adding dead shares on the first deposit is recommended.
- **Effort:** 2h
- **Done when:** On the first LP deposit (total_supply == 0), additional 1000 shares are minted to the address `0x0..dead` (or equivalent). Alternatively: documented risk acceptance with justification that MIN_LP_DEPOSIT=$100 is sufficient.

---

### P1-2. claim_lp_fees: saturating_sub may mask desynchronization

- **Category:** LP System
- **File(s):** `programs/holging/src/instructions/claim_lp_fees.rs:88`
- **What:** The line `pool.total_lp_fees_pending = pool.total_lp_fees_pending.saturating_sub(amount)` uses saturating_sub instead of checked_sub. If total_lp_fees_pending < amount due to a bug, the underflow will be masked (result = 0 instead of an error).
- **Why:** total_lp_fees_pending is a critical invariant: the sum of all position.pending_fees <= total_lp_fees_pending. If the invariant is violated, saturating_sub hides the problem. With checked_sub, the program returns an error, and the bug is discovered immediately.
- **Effort:** 0.5h
- **Done when:** `saturating_sub` replaced with `checked_sub` with `ok_or(error!(SolshortError::MathOverflow))`. A test added for the invariant: `sum(position.pending_fees) == pool.total_lp_fees_pending`.

---

### P1-3. No timelock on critical admin operations

- **Category:** Access Control
- **File(s):** `programs/holging/src/instructions/update_fee.rs:22`, `instructions/update_k.rs:22`, `instructions/update_min_lp_deposit.rs:22`, `instructions/accrue_funding.rs:209-216`
- **What:** The admin can instantly: change the fee (up to 1%), change k (when circulating == 0), change the funding rate, change min_lp_deposit. There is no timelock — changes are applied in the same block.
- **Why:** Instant parameter changes are a risk for users. If the authority is compromised (even with multisig), an attacker can change parameters and exploit in a single transaction. A timelock gives users time to react.
- **Effort:** 8h (new PDA state for pending changes + execute after delay)
- **Done when:** Critical parameters (fee_bps, funding_rate, min_lp_deposit) require a two-step update: propose → wait 24h → execute. Alternatively: documented risk acceptance.

---

### P1-4. Keeper: no health monitoring and alerting

- **Category:** Monitoring
- **File(s):** `scripts/keeper.ts:195-207` (runOnce error handling)
- **What:** The keeper (`scripts/keeper.ts`) runs as a simple setInterval loop. On error — only console.error. Missing: (1) health check endpoint, (2) alerts on failure (Telegram/Discord/PagerDuty), (3) metrics (successful/failed calls), (4) vault ratio monitoring, (5) oracle freshness monitoring.
- **Why:** If the keeper goes down, funding stops accruing. With MAX_FUNDING_ELAPSED_SECS=30 days (`constants.rs:14`), the consequences are delayed, but without monitoring the problem may go undetected for weeks. The vault ratio can become critical without alerts.
- **Effort:** 4h
- **Done when:** The keeper sends alerts on: (1) 3 consecutive failed accruals, (2) vault ratio < 120%, (3) oracle not updated for > 5 minutes, (4) keeper restart. Minimum: Telegram/Discord webhook.

---

### P1-5. Keeper: no redundancy and auto-restart

- **Category:** Operations
- **File(s):** `scripts/keeper.ts:149-212`
- **What:** The keeper runs as `npx ts-node scripts/keeper.ts` — a simple Node.js process. Missing: systemd unit, Docker container, PM2 config, health check, auto-restart on crash.
- **Why:** A single keeper = single point of failure. On OOM, crash, or server reboot — funding stops accruing.
- **Effort:** 2h
- **Done when:** The keeper is wrapped in a systemd service (or Docker + restart policy + healthcheck). A runbook for deploy/restart is documented. A backup keeper on a second server is considered.

---

### P1-6. No integration tests for edge cases

- **Category:** Testing
- **File(s):** `tests/holging.ts:446-850+`
- **What:** Current integration tests cover the happy path: initialize → mint → redeem → LP add/remove. Not covered: (1) circuit breaker trigger on redeem, (2) pause/unpause flow, (3) transfer_authority + accept_authority, (4) accrue_funding with various elapsed times, (5) claim_lp_fees, (6) withdraw_fees with vault health check, (7) unauthorized access attempts (negative tests), (8) slippage protection (min_tokens_out / min_usdc_out), (9) rate limit trigger.
- **Why:** Happy path tests do not catch bugs in edge cases. The absence of negative tests means access control is not verified on-chain.
- **Effort:** 8h
- **Done when:** Tests added for: circuit breaker, pause flow, authority transfer, accrue_funding, claim_lp_fees, unauthorized access (expect error), slippage rejection. Coverage: all 20 instructions have at least 1 happy path + 1 negative test.

---

### P1-7. Mainnet RPC for keeper

- **Category:** Operations
- **File(s):** `scripts/keeper.ts:21`
- **What:** The keeper uses `https://api.devnet.solana.com` by default. For mainnet, a private RPC (Helius, Triton, QuickNode) with rate limits sufficient for the keeper loop is needed.
- **Why:** The public mainnet RPC (`https://api.mainnet-beta.solana.com`) has strict rate limits and may reject keeper transactions. This will lead to missed funding accruals.
- **Effort:** 1h
- **Done when:** `RPC_URL` env variable documented as required for mainnet. Keeper config includes a fallback RPC. README contains recommended RPC providers.

---

### P1-8. MAX_CONFIDENCE_PCT = 2% may be too strict

- **Category:** Oracle
- **File(s):** `programs/holging/src/constants.rs:37`, `programs/holging/src/oracle.rs:108-111`
- **What:** `MAX_CONFIDENCE_PCT = 2` means that if the Pyth confidence interval > 2% of the price, the oracle is rejected. During periods of high volatility, the SOL confidence interval may exceed 2%, which would block all mint/redeem operations.
- **Why:** An overly strict confidence check = protocol freeze during volatility. Too lenient = price manipulation risk. A balance is needed. Analyzing historical SOL/USD confidence intervals on mainnet is recommended.
- **Effort:** 2h (data analysis + decision)
- **Done when:** Historical SOL/USD Pyth confidence intervals for the last 6 months analyzed. MAX_CONFIDENCE_PCT value adjusted based on data (2–5%). Justification for the chosen value documented.

---

### P1-9. No on-chain solvency invariant check

- **Category:** LP System
- **File(s):** `programs/holging/src/instructions/claim_lp_fees.rs:65`, `instructions/withdraw_fees.rs:56-76`
- **What:** There is no single on-chain assert that verifies: `vault_balance >= obligations + lp_principal + total_lp_fees_pending`. withdraw_fees partially checks this (`instructions/withdraw_fees.rs:65-75`), but claim_lp_fees and remove_liquidity only check `amount <= vault_balance`.
- **Why:** Violation of the global solvency invariant = the protocol is insolvent. A centralized check in every operation that touches the vault guarantees early detection of desynchronization.
- **Effort:** 4h
- **Done when:** A function `assert_vault_solvent(pool, vault_balance, sol_price)` is created in fees.rs. Called at the end of mint, redeem, add_liquidity, remove_liquidity, claim_lp_fees, withdraw_fees. A test confirms the invariant holds.

---

### P1-10. Frontend: mainnet configuration

- **Category:** Operations
- **File(s):** `app/src/utils/program.ts`, `app/src/utils/pyth.ts`, `app/src/hooks/useSolshort.ts`
- **What:** The frontend is configured for devnet. For mainnet: (1) update RPC endpoint, (2) update program ID if changed, (3) update Pyth price feed account for mainnet, (4) update USDC mint address to mainnet (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
- **Why:** A frontend with devnet config on mainnet = users will be unable to interact with the protocol.
- **Effort:** 2h
- **Done when:** The frontend supports devnet/mainnet switching via env variable. Mainnet addresses documented. Smoke test on mainnet passed.

---

## P2 — Nice-to-Have (post-launch)

---

### P2-1. Remove migrate_pool instruction

- **Category:** Code Cleanup
- **File(s):** `programs/holging/src/instructions/migrate_pool.rs:1-103`, `programs/holging/src/instructions/mod.rs:8`, `programs/holging/src/lib.rs:90-92`
- **What:** `migrate_pool` is a one-time migration for adding LP fields to existing devnet accounts. It uses hardcoded offsets (`migrate_pool.rs:93`: `min_deposit_offset = 8 + 205 + 64`), `UncheckedAccount`, and manual byte writing. After the devnet pool migration, this instruction is no longer needed.
- **Why:** (1) UncheckedAccount + manual byte offsets = attack surface, (2) hardcoded offsets will become incorrect with any change to PoolState, (3) the instruction is accessible forever — anyone with authority can call it again (although there is a check `current_len >= target_len`).
- **Effort:** 1h
- **Done when:** migrate_pool removed from: instructions/migrate_pool.rs, instructions/mod.rs, lib.rs. IDL updated. IDL validation test (`tests/holging.ts:238`) updated (19 instructions instead of 20).

---

### P2-2. Add event for update_price

- **Category:** Monitoring
- **File(s):** `programs/holging/src/instructions/update_price.rs:41-47`
- **What:** update_price uses `msg!()` instead of `emit!()`. All other instructions emit structured events. update_price is the only exception.
- **Why:** `msg!()` entries are harder to parse for off-chain indexing. Structured events via `emit!()` allow efficient tracking of price updates through event subscription (Anchor event parser, Yellowstone gRPC).
- **Effort:** 1h
- **Done when:** An `UpdatePriceEvent { old_price, new_price, timestamp }` is added to events.rs. update_price.rs uses `emit!()`.

---

### P2-3. Add max_fee_bps constraint on initialize

- **Category:** Parameters
- **File(s):** `programs/holging/src/instructions/initialize.rs:60`
- **What:** `require!(fee_bps <= 100, ...)` — max fee 1%. Consider a stricter limit for initialize (e.g., 50 bps = 0.5%) and keep 100 bps only for update_fee with a timelock.
- **Why:** A pool initialized with a 1% fee has a roundtrip cost of 2% — expensive for users. A stricter limit at creation protects against mistakes.
- **Effort:** 0.5h
- **Done when:** Init fee limit reduced or justification for the current limit documented.

---

### P2-4. Rate limit MIN_ACTION_INTERVAL_SECS = 2s — consider increasing

- **Category:** Parameters
- **File(s):** `programs/holging/src/constants.rs:61`, `instructions/mint.rs:84-89`, `instructions/redeem.rs:79-86`
- **What:** Rate limit of 2 seconds between mint/redeem. The check uses `last_oracle_timestamp` from pool state — this is a global rate limit on the entire pool, not per-user.
- **Why:** Under high activity, one user can block mint/redeem for everyone for 2 seconds. Consider a per-user rate limit or reducing to 1 slot (~400ms). The current design is a trade-off: simplicity vs fairness.
- **Effort:** 4h (if switching to per-user)
- **Done when:** Decision documented: keep global rate limit (simplicity) or switch to per-user (fairness). If per-user: add a user-specific PDA for tracking.

---

### P2-5. Add view-only instructions for off-chain queries

- **Category:** Operations
- **File(s):** `programs/holging/src/lib.rs`
- **What:** Add read-only instructions: `get_shortsol_price(pool_id)`, `get_vault_health(pool_id)`, `get_lp_position_value(pool_id, owner)`. They do not mutate state but allow off-chain clients to obtain computed values via simulate.
- **Why:** Currently, off-chain clients must replicate on-chain math themselves (shortsol_price, obligations, LP value). View instructions guarantee consistency.
- **Effort:** 4h
- **Done when:** View instructions added. The frontend uses them instead of local math. Tests confirm consistency.

---

### P2-6. Documentation: runbook for emergency scenarios

- **Category:** Operations
- **File(s):** None (need to create `docs/RUNBOOK.md`)
- **What:** Create an operational runbook with procedures for: (1) Emergency pause — who, how, when, (2) Oracle failure — what to do if the oracle is stale > 5 minutes, (3) Vault undercollateralization — steps when vault ratio < 100%, (4) Key compromise — procedure for revoke + transfer authority, (5) Keeper failure — manual accrue_funding, (6) Bug discovery — triage + pause + fix + redeploy.
- **Why:** During an incident there is no time to dig through code. A runbook ensures rapid response.
- **Effort:** 4h
- **Done when:** `docs/RUNBOOK.md` created with all 6 scenarios. Each scenario contains: trigger condition, step-by-step actions, CLI commands, rollback procedure.

---

### P2-7. Legal: Terms of Service and Disclaimers

- **Category:** Legal / Compliance
- **File(s):** Frontend (app/), README.md
- **What:** Add: (1) Terms of Service for protocol usage, (2) Risk disclaimers (shortSOL is not financial advice, risk of loss, smart contract risk), (3) Jurisdictional restrictions (if applicable), (4) Privacy policy.
- **Why:** Legal protection for the project and its users. DeFi protocols without ToS are exposed to regulatory risk.
- **Effort:** 8h+ (requires legal consultation)
- **Done when:** ToS published on the website. Disclaimers visible on first interaction. Legal consultation obtained.

---

## Recommended Execution Order

```
Phase 1 — Oracle & Security (1–2 days):
  P0-1  MAX_STALENESS_SECS → 30s
  P0-2  Validate usdc_mint
  P0-3  MAX_UPDATE_PRICE_DEVIATION_BPS → 1500
  P0-4  Pyth feed ID verification
  P1-2  claim_lp_fees saturating_sub → checked_sub

Phase 2 — Access Control & Ops (2–3 days):
  P0-6  Multisig for authority
  P0-5  Verifiable build
  P0-8  Mainnet deploy config
  P1-7  Mainnet RPC for keeper

Phase 3 — Testing & Monitoring (3–5 days):
  P1-6  Integration tests for edge cases
  P1-4  Keeper monitoring & alerting
  P1-5  Keeper redundancy

Phase 4 — Audit (2–4 weeks):
  P0-7  Security audit

Phase 5 — Launch prep (1–2 days):
  P1-8  Confidence interval analysis
  P1-9  Solvency invariant check
  P1-10 Frontend mainnet config

Phase 6 — Post-launch (ongoing):
  P2-1 .. P2-7
```

---

## Acceptance Criteria for Mainnet Launch

All P0 items MUST be completed (Done when conditions met). P1 items — either completed or documented risk acceptance with justification.

**Minimum set for launch:**
- [x] P0-1 Oracle staleness = 30s *(done: `0d3a2d7`)*
- [x] P0-2 USDC mint validated *(done: `0d3a2d7`)*
- [x] P0-3 Update deviation = 15% *(done: `0d3a2d7`)*
- [ ] P0-4 Feed ID verified
- [ ] P0-5 Verifiable build
- [ ] P0-6 Multisig authority
- [ ] P0-7 Security audit completed
- [ ] P0-8 Mainnet deploy config
