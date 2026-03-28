# Holging Security Audit Report

| Field | Value |
|---|---|
| **Protocol** | Holging -- Tokenized Inverse SOL Exposure on Solana |
| **Commit** | `main` branch, 2026-03-28 snapshot |
| **Scope** | `programs/solshort/src/**` (19 Rust files, ~1 600 LoC) + `scripts/keeper.ts` |
| **Framework** | Anchor 0.32.1, Pyth Solana Receiver SDK 1.1.0, SPL Token |
| **Methodology** | Manual line-by-line review, OWASP / SWC / OtterSec checklist |
| **Auditor** | Automated Security Reviewer (Claude Opus 4.6) |
| **Date** | 2026-03-28 |
| **Risk Level** | **MEDIUM** (no critical exploitable issues; several medium-severity design risks) |

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 5 |
| LOW | 4 |
| INFORMATIONAL | 4 |
| **Total** | **15** |

All 19 previously reported issues from the Architect review have been verified as resolved in the current codebase. Findings below represent residual and newly identified risks.

---

## Table of Contents

1. [HIGH-01] Oracle Deviation Walk: Compound 50% + 15% = 57.5% Price Manipulation Window
2. [HIGH-02] LP First-Depositor Share Inflation (No Dead Shares)
3. [MEDIUM-01] `migrate_pool` Hardcoded Byte Offsets -- Fragile Serialization Coupling
4. [MEDIUM-02] `funding_config` Optional in `mint`/`redeem` -- Stale k Bypass
5. [MEDIUM-03] `accrue_funding` `factor_num` Can Reach Zero via `saturating_sub`
6. [MEDIUM-04] `claim_lp_fees` Uses `saturating_sub` for `total_lp_fees_pending`
7. [MEDIUM-05] USDC Mint Not Validated in `initialize`
8. [LOW-01] `fee_per_share_accumulated` Precision Loss for Small Fees
9. [LOW-02] No Event Emission in `update_min_lp_deposit`
10. [LOW-03] `update_price` Permissionless -- MEV Griefing Vector
11. [LOW-04] `realloc(target_len, false)` -- Uninitialized Memory Between Old/New Range
12. [INFO-01] `init_if_needed` Re-initialization Guard via `owner == default`
13. [INFO-02] Rate Limit Based on Oracle Timestamp, Not Slot
14. [INFO-03] `MAX_STALENESS_SECS = 120` Intended for Devnet Only
15. [INFO-04] No Timelock on Admin Parameter Changes

---

## Findings

---

### [HIGH-01] Oracle Deviation Walk: Compound 50% + 15% = 57.5% Price Manipulation Window

- **Severity:** HIGH
- **Component:** `oracle.rs:22-27`, `oracle.rs:36-41`, `constants.rs:42-45`
- **Category:** Oracle Manipulation (OWASP A03 -- Injection / Economic)
- **Description:**
  `update_price` uses `MAX_UPDATE_PRICE_DEVIATION_BPS = 5000` (50%) while `mint`/`redeem` use `MAX_PRICE_DEVIATION_BPS = 1500` (15%). Both check deviation against `last_cached_price`, which is mutable. An attacker can execute a two-step sequence within the same block:
  1. Call `update_price` with a Pyth price at +50% of the cached price. The cached price is updated.
  2. Call `mint` with a price at +15% of the *new* cached price, achieving 1.50 x 1.15 = 1.725x (72.5% above original), or alternatively -50% then -15% for -57.5%.

  Because `shortSOL_price = k / sol_price`, a 57.5% drop in `sol_price` inflates `shortSOL_price` by ~135%, allowing the attacker to mint far fewer tokens per USDC (or redeem at inflated value).

- **Impact:** Economic manipulation of mint/redeem pricing. An attacker with a favorable Pyth oracle observation (e.g., during volatile markets or via a crafted price update) can extract value from the vault at the expense of existing token holders.

- **PoC Scenario:**
  1. Cached price = $100. Real price = $100.
  2. Attacker calls `update_price` with Pyth price = $50 (within 50% deviation). Cache updates to $50.
  3. Attacker calls `mint` with Pyth price = $42.50 (within 15% of $50). `shortSOL_price` computed at $42.50 denominator instead of $100.
  4. `shortSOL_price = k * 1e9 / 42.5e9` -- roughly 2.35x higher than at $100. Attacker gets 2.35x fewer tokens for same USDC but the *value* upon price reversion is 2.35x.
  5. When price reverts, attacker redeems at true price for profit.

- **Remediation:**
  Implement an absolute anchor price (e.g., TWAP or an immutable "last known good" price that only moves by a tighter band per time unit). Alternatively, add a cooldown between `update_price` and `mint`/`redeem`, or use a single deviation threshold for all operations:

  ```rust
  // Option A: Single deviation for all operations
  pub const MAX_PRICE_DEVIATION_BPS: u64 = 1500; // 15% everywhere

  // Option B: Time-weighted cooldown
  pub const UPDATE_PRICE_COOLDOWN_SECS: i64 = 60;
  // In mint/redeem:
  require!(
      clock.unix_timestamp - pool.last_price_update_timestamp >= UPDATE_PRICE_COOLDOWN_SECS,
      SolshortError::PriceUpdateTooRecent
  );
  ```

- **Status:** Open

---

### [HIGH-02] LP First-Depositor Share Inflation (No Dead Shares)

- **Severity:** HIGH
- **Component:** `fees.rs:104-119` (`calc_lp_shares`), `add_liquidity.rs:101`
- **Category:** Economic Attack (Insecure Design -- A04)
- **Description:**
  When `lp_total_supply == 0`, shares are minted 1:1 with `usdc_amount`. A first depositor can:
  1. Deposit the minimum ($100 USDC), receive 100_000_000 LP shares.
  2. Transfer a large USDC amount directly to the vault (not via `add_liquidity`), inflating `vault_balance` relative to `lp_principal`.

  However, the share calculation uses `lp_principal` (not `vault_balance`) as the denominator: `shares = usdc_amount * lp_total_supply / lp_principal`. Since the direct transfer does NOT increase `lp_principal`, the donation attack vector through `lp_principal`-based math is significantly mitigated.

  **Residual risk:** If the protocol ever changes to use `vault_balance` for share pricing (common pattern), or if funding fee distribution inflates `fee_per_share_accumulated` disproportionately before second LP deposits, there is an inflation vector.

  The `MIN_LP_DEPOSIT = $100` provides further mitigation by making the attack economically expensive.

- **Impact:** A sophisticated first depositor could capture a disproportionate share of future fee distributions. With current `lp_principal`-based math, direct vault donation does not inflate share price, but the defense is not robust (no dead shares pattern).

- **PoC Scenario:**
  1. Attacker is first LP. Deposits minimum $100.
  2. After fees accumulate, `fee_per_share_accumulated` grows.
  3. Second LP deposits $10,000. Shares = `10_000e6 * 100e6 / 100e6 = 10_000e6`.
  4. If attacker had inflated `lp_principal` somehow, second depositor gets fewer shares. Current code is resistant but lacks defense-in-depth.

- **Remediation:**
  Implement the dead shares (virtual offset) pattern used by ERC-4626:

  ```rust
  pub fn calc_lp_shares(usdc_amount: u64, lp_total_supply: u64, lp_principal: u64) -> Result<u64> {
      const VIRTUAL_SHARES: u64 = 1_000; // 1e3 dead shares
      const VIRTUAL_ASSETS: u64 = 1_000; // 1e3 dead USDC (0.001 USDC)

      let total_shares = lp_total_supply.checked_add(VIRTUAL_SHARES).ok_or(/*...*/)?;
      let total_assets = lp_principal.checked_add(VIRTUAL_ASSETS).ok_or(/*...*/)?;

      (usdc_amount as u128)
          .checked_mul(total_shares as u128).ok_or(/*...*/)?
          .checked_div(total_assets as u128).ok_or(/*...*/)?
          .try_into().map_err(|_| /*...*/)
  }
  ```

- **Status:** Open (defense-in-depth recommended)

---

### [MEDIUM-01] `migrate_pool` Hardcoded Byte Offsets -- Fragile Serialization Coupling

- **Severity:** MEDIUM
- **Component:** `migrate_pool.rs:83-97`
- **Category:** Security Misconfiguration (A05)
- **Description:**
  The `migrate_pool` handler uses hardcoded byte offsets to locate the `min_lp_deposit` field at offset `8 + 205 + 64 = 277`. These offsets are tightly coupled to the Borsh serialization layout of `PoolState`. If any field is reordered, resized, or a new field is inserted before the LP fields, the offset becomes incorrect and `min_lp_deposit` will be written to the wrong memory location, potentially corrupting other state fields.

  The comment `// lp_mint offset: 8+32+16+2+8+8+8+8+8+32+32+1+8+8+1+1+32 = 213` calculates 213 but the code uses `8 + 205 + 64 = 277` for `min_deposit_offset`, implying old fields sum to 205 bytes. The discrepancy between comment (213) and code (205) suggests a possible past miscalculation, though the current code appears to target the correct field.

- **Impact:** If `PoolState` is ever modified, `migrate_pool` could silently corrupt pool state, potentially zeroing out security-critical fields like `fee_bps` or `authority`.

- **PoC Scenario:**
  1. Developer adds a new `u64` field before `pending_authority` in `PoolState`.
  2. `migrate_pool` still writes `min_lp_deposit` at offset 277.
  3. The write corrupts the `lp_total_supply` or `fee_per_share_accumulated` field.
  4. LP system becomes insolvent.

- **Remediation:**
  Replace hardcoded offsets with Anchor's `try_deserialize` / `try_serialize`, or compute offsets from `core::mem::offset_of!` (Rust 1.77+):

  ```rust
  // Preferred: deserialize, modify, serialize
  let mut pool: PoolState = PoolState::try_deserialize(&mut &data[..])?;
  pool.min_lp_deposit = MIN_LP_DEPOSIT;
  pool.try_serialize(&mut &mut data[..])?;
  ```

  If migration is a one-time operation that has already been executed on all existing pools, consider removing the instruction entirely to reduce attack surface.

- **Status:** Open (recommend removal if migration complete)

---

### [MEDIUM-02] `funding_config` Optional in `mint`/`redeem` -- Stale k Bypass

- **Severity:** MEDIUM
- **Component:** `mint.rs:68-73`, `redeem.rs:59-64`
- **Category:** Insecure Design (A04)
- **Description:**
  In both `MintShortSol` and `RedeemShortSol` account structs, `funding_config` is declared as `Option<Account<'info, FundingConfig>>`. If the client does not pass the `FundingConfig` account, the inline funding accrual is skipped entirely, and `k` remains at its last-updated value.

  This means a user can intentionally omit the `FundingConfig` account to mint/redeem at a stale (higher) `k` value, effectively avoiding the funding rate decay that should continuously reduce `k`.

- **Impact:** Users can avoid funding rate penalties by not passing the optional account. Over time, if the keeper is infrequent and users consistently omit `funding_config`, the actual `k` used for pricing diverges from the intended time-decayed `k`. This creates an unfair advantage for informed users over LPs who expect `k` decay.

- **PoC Scenario:**
  1. `k` was last accrued 12 hours ago. At 10 bps/day, `k` should have decayed by ~0.05%.
  2. User calls `mint` WITHOUT passing `funding_config`.
  3. `apply_funding_inline` is never called. Mint uses the stale (higher) `k`.
  4. Higher `k` means higher `shortSOL_price`, so user gets fewer tokens for same USDC (disadvantageous for mint).
  5. Conversely, for `redeem`: stale higher `k` means higher `shortSOL_price`, more USDC out per token -- advantageous for redeemer at LP expense.

- **Remediation:**
  Make `funding_config` mandatory when it exists (check on-chain if the PDA has been initialized):

  ```rust
  // After applying optional funding, verify k freshness
  if ctx.accounts.funding_config.is_none() {
      // Check if FundingConfig PDA exists on-chain
      let (funding_pda, _) = Pubkey::find_program_address(
          &[FUNDING_SEED, pool.key().as_ref()],
          ctx.program_id,
      );
      // If it exists, require it to be passed
      // (This requires remaining_accounts check or a pool-level flag)
  }

  // Simpler: add a flag to PoolState
  // pub funding_enabled: bool,
  // require!(!pool.funding_enabled || ctx.accounts.funding_config.is_some(),
  //     SolshortError::FundingConfigRequired);
  ```

- **Status:** Open

---

### [MEDIUM-03] `accrue_funding` `factor_num` Can Approach Zero via `saturating_sub`

- **Severity:** MEDIUM
- **Component:** `accrue_funding.rs:26-29`
- **Category:** Integer Arithmetic (A03 -- Injection/Logic)
- **Description:**
  The funding decay formula computes:
  ```
  denom = SECS_PER_DAY * BPS_DENOMINATOR = 864_000_000
  reduction = rate_bps * elapsed_to_apply
  factor_num = denom.saturating_sub(reduction)
  ```

  With `MAX_FUNDING_RATE_BPS = 100` and `MAX_FUNDING_ELAPSED_SECS = 30 days = 2_592_000`:
  ```
  reduction = 100 * 2_592_000 = 259_200_000
  factor_num = 864_000_000 - 259_200_000 = 604_800_000  (ok, ~70%)
  ```

  However, the `require!(factor_num > 0)` check on line 29 guards against zero, but `saturating_sub` masks the true arithmetic. If parameters ever change (e.g., `MAX_FUNDING_RATE_BPS` raised or `MAX_FUNDING_ELAPSED_SECS` extended), `reduction` could exceed `denom`, and `saturating_sub` would yield 0, triggering the require. The issue is that `saturating_sub` hides the overflow rather than failing explicitly.

  Additionally, at current parameters: if keeper is offline for 30 days at 100 bps/day rate, `k` decays to `k * 604_800_000 / 864_000_000 = k * 0.7`. Over multiple 30-day cycles this compounds toward zero.

- **Impact:** If `factor_num` saturates to a very small value, `k` can decay to near-zero over repeated cycles, making `shortSOL_price` effectively infinite and breaking the protocol economics.

- **PoC Scenario:**
  1. Rate = 100 bps/day, keeper offline 30 days.
  2. `k_new = k * 0.70` per cycle.
  3. After 10 cycles (300 days no keeper): `k_new = k * 0.70^10 = k * 0.028`.
  4. `shortSOL_price` inflates 35x. Redemptions drain vault.

- **Remediation:**
  Add a minimum `k` floor and use `checked_sub` instead of `saturating_sub`:

  ```rust
  pub const MIN_K: u128 = 1_000_000; // Minimum k value

  let reduction: u128 = cfg.rate_bps as u128 * elapsed_to_apply as u128;
  let factor_num = denom.checked_sub(reduction)
      .ok_or(error!(SolshortError::MathOverflow))?;

  let new_k = pool.k
      .checked_mul(factor_num).ok_or(/*...*/)?
      .checked_div(denom).ok_or(/*...*/)?;

  pool.k = new_k.max(MIN_K);
  ```

- **Status:** Open

---

### [MEDIUM-04] `claim_lp_fees` Uses `saturating_sub` for `total_lp_fees_pending`

- **Severity:** MEDIUM
- **Component:** `claim_lp_fees.rs:88`
- **Category:** Accounting Invariant Violation (A04)
- **Description:**
  Line 88: `pool.total_lp_fees_pending = pool.total_lp_fees_pending.saturating_sub(amount);`

  If `amount > total_lp_fees_pending` due to accumulated rounding errors in the fee accumulator, `saturating_sub` silently clamps to zero instead of reverting. This masks an accounting invariant violation: `total_lp_fees_pending` should always be >= sum of all individual `pending_fees`.

  The `withdraw_fees` instruction uses `total_lp_fees_pending` as a reserve protection:
  ```rust
  let lp_reserved = pool.lp_principal.checked_add(pool.total_lp_fees_pending)?;
  ```
  If `total_lp_fees_pending` is erroneously zero due to saturating underflow, admin can withdraw USDC that should be reserved for LP fee claims.

- **Impact:** Accounting drift over time. In the worst case, LP providers cannot claim their full entitled fees because the admin has withdrawn funds that should have been reserved.

- **PoC Scenario:**
  1. Fee accumulator distributes 1000 USDC across 10 LPs.
  2. Due to precision loss in `SHARE_PRECISION` division, `sum(individual pending_fees)` = 1001 USDC.
  3. First 9 LPs claim. `total_lp_fees_pending` decrements normally.
  4. 10th LP claims 101 USDC. `saturating_sub` yields 0 instead of reverting on underflow.
  5. `total_lp_fees_pending = 0`. Admin's `withdraw_fees` no longer reserves anything for future LP fees.

- **Remediation:**
  Use `checked_sub` and handle the edge case explicitly:

  ```rust
  pool.total_lp_fees_pending = pool
      .total_lp_fees_pending
      .checked_sub(amount)
      .unwrap_or_else(|| {
          msg!("WARN: total_lp_fees_pending underflow by {}", 
               amount.saturating_sub(pool.total_lp_fees_pending));
          0
      });
  ```

  Or better, use `checked_sub` with an explicit error and investigate the root cause of any precision drift.

- **Status:** Open

---

### [MEDIUM-05] USDC Mint Not Validated in `initialize`

- **Severity:** MEDIUM
- **Component:** `initialize.rs:46`
- **Category:** Input Validation (A03)
- **Description:**
  The `usdc_mint` account in `Initialize` is declared as `pub usdc_mint: Account<'info, Mint>` with no address constraint. Any SPL token mint can be passed as "USDC". The vault is then initialized with this arbitrary mint.

  While the vault PDA includes `usdc_mint.key()` in its seeds (preventing cross-mint vault collisions), and `mint`/`redeem` also derive the vault PDA from `usdc_mint.key()` (so a fake-USDC pool cannot interact with a real-USDC vault), a pool initialized with a fake mint is economically worthless but occupies the `pool_id` namespace.

- **Impact:** An attacker can front-run pool creation with a chosen `pool_id` and a fake USDC mint, squatting on the desired pool ID. The legitimate admin must use a different `pool_id`. No direct financial loss, but operational disruption.

- **PoC Scenario:**
  1. Attacker monitors mempool for `initialize` transaction with `pool_id = "sol"`.
  2. Attacker front-runs with `pool_id = "sol"` but `usdc_mint = attacker_token`.
  3. Legitimate admin's `initialize` fails because PDA `["pool", "sol"]` already exists.
  4. Admin must use `pool_id = "sol-v2"` or similar.

- **Remediation:**
  Add a hardcoded USDC mint address constraint:

  ```rust
  // In constants.rs
  pub const USDC_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  // In Initialize accounts
  #[account(address = USDC_MINT)]
  pub usdc_mint: Account<'info, Mint>,
  ```

- **Status:** Open

---

### [LOW-01] `fee_per_share_accumulated` Precision Loss for Small Fees

- **Severity:** LOW
- **Component:** `fees.rs:123-141` (`accumulate_fee`)
- **Category:** Arithmetic Precision (A04)
- **Description:**
  The fee accumulator delta is computed as:
  ```
  delta = fee_amount * SHARE_PRECISION / lp_total_supply
  ```
  With `SHARE_PRECISION = 1e12`, if `fee_amount = 1` (1 micro-USDC) and `lp_total_supply = 1e12` (1M LP tokens at 1e6 decimals), `delta = 1 * 1e12 / 1e12 = 1`. This is exact.

  However, if `lp_total_supply > 1e12`, `delta` rounds to 0, and the fee is effectively lost (remains in vault but never claimable by LPs). At `lp_total_supply = 1e13` (10M LP tokens), any fee under 10 micro-USDC ($0.00001) is lost.

- **Impact:** Negligible at current scale. Becomes relevant only at very high LP supply with very small individual fee events (e.g., 1 micro-USDC fees on a $10M LP pool).

- **Remediation:**
  Acceptable at current scale. For defense-in-depth, accumulate dust fees in a separate counter and distribute when threshold is met:

  ```rust
  let delta = (fee_amount as u128)
      .checked_mul(SHARE_PRECISION)?
      .checked_div(pool.lp_total_supply as u128)?;
  if delta == 0 {
      pool.dust_fees = pool.dust_fees.checked_add(fee_amount)?;
      return Ok(());
  }
  ```

- **Status:** Acknowledged (acceptable risk)

---

### [LOW-02] No Event Emission in `update_min_lp_deposit`

- **Severity:** LOW
- **Component:** `update_min_lp_deposit.rs:22-29`
- **Category:** Logging & Monitoring (A09)
- **Description:**
  The `update_min_lp_deposit` handler changes a security-relevant parameter (`min_lp_deposit`) but does not emit any event. All other admin parameter changes (`update_fee`, `update_k`, `set_pause`, `transfer_authority`) emit events for off-chain monitoring.

- **Impact:** Off-chain monitoring systems cannot detect when the minimum LP deposit threshold changes. An admin lowering it to 1 micro-USDC would re-enable first-depositor attacks without any on-chain trail.

- **Remediation:**
  ```rust
  #[event]
  pub struct UpdateMinLpDepositEvent {
      pub old_min_lp_deposit: u64,
      pub new_min_lp_deposit: u64,
      pub authority: Pubkey,
  }

  // In handler:
  let old = pool.min_lp_deposit;
  pool.min_lp_deposit = new_min_lp_deposit;
  emit!(UpdateMinLpDepositEvent {
      old_min_lp_deposit: old,
      new_min_lp_deposit,
      authority: ctx.accounts.authority.key(),
  });
  ```

- **Status:** Open

---

### [LOW-03] `update_price` Permissionless -- MEV Griefing Vector

- **Severity:** LOW
- **Component:** `update_price.rs:24`, `update_price.rs:26-49`
- **Category:** MEV / Griefing (A01 -- Access Control)
- **Description:**
  `update_price` requires only a generic `Signer` (any wallet), not the pool authority. The 50% wide deviation window means anyone can push the cached price to an extreme within that band. While `last_oracle_timestamp` is NOT updated (preventing rate-limit bypass), the cached price change persists and affects subsequent `mint`/`redeem` deviation checks.

  A MEV searcher could call `update_price` right before a user's `mint` to shift the cached price, then sandwich the user's transaction.

- **Impact:** Griefing: an attacker can force the cached price to the edge of the 50% band, causing legitimate `mint`/`redeem` transactions to fail with `PriceDeviationTooHigh` if the Pyth price has moved. Combined with HIGH-01, this enables a two-step price walk.

- **Remediation:**
  Either restrict `update_price` to authority-only, or narrow the deviation to match `mint`/`redeem` (15%):

  ```rust
  // Option A: Authority-only
  #[account(has_one = authority)]
  pub pool_state: Account<'info, PoolState>,
  pub authority: Signer<'info>,

  // Option B: Same deviation as mint/redeem
  let oracle_price = oracle::get_validated_price(
      &ctx.accounts.pyth_price,
      pool.last_oracle_price,
  )?;
  ```

- **Status:** Open

---

### [LOW-04] `realloc(target_len, false)` -- Uninitialized Memory in Migrated Range

- **Severity:** LOW
- **Component:** `migrate_pool.rs:59`
- **Category:** Memory Safety (A05)
- **Description:**
  `pool_info.realloc(target_len, false)` does NOT zero-initialize the new bytes. The code then manually zeros `data[lp_start..target_len]` on line 87, which is correct. However, there is a subtle window between `realloc` (line 59) and the zeroing loop (line 87) where the rent transfer (lines 62-76) could fail, leaving the account in a partially migrated state with uninitialized memory.

  If the rent transfer fails, the function returns an error, and the realloc is rolled back by the Solana runtime (transaction-level atomicity). So in practice this is safe.

- **Impact:** None in practice due to transaction atomicity. The `false` parameter is a code smell that could be dangerous if copy-pasted elsewhere.

- **Remediation:**
  Use `realloc(target_len, true)` for safety, accepting the marginal CU cost:

  ```rust
  pool_info.realloc(target_len, true)?; // zero-init new bytes
  ```

- **Status:** Acknowledged (safe due to tx atomicity, but recommend `true` for clarity)

---

### [INFO-01] `init_if_needed` Re-initialization Guard via `owner == default`

- **Severity:** INFORMATIONAL
- **Component:** `add_liquidity.rs:43-49`, `add_liquidity.rs:88-95`
- **Category:** Account Validation
- **Description:**
  `LpPosition` uses `init_if_needed` with an `owner == Pubkey::default()` check to detect first initialization. This is a valid pattern, but note that `init_if_needed` has historically been a source of re-initialization vulnerabilities in Anchor programs. The current code is safe because:
  1. The PDA seeds include `lp_provider.key()`, making each position unique per user.
  2. After first init, `owner` is set to a non-default value, preventing re-entry to the init branch.

  The Anchor `init_if_needed` feature is explicitly opted into via `Cargo.toml` (`features = ["init-if-needed"]`).

- **Impact:** None. Included for auditor awareness.

- **Status:** Acknowledged (safe pattern)

---

### [INFO-02] Rate Limit Based on Oracle Timestamp, Not Slot

- **Severity:** INFORMATIONAL
- **Component:** `mint.rs:84-90`, `redeem.rs:80-86`
- **Category:** Timing Assumptions
- **Description:**
  The 2-second rate limit (`MIN_ACTION_INTERVAL_SECS`) compares `clock.unix_timestamp` against `pool.last_oracle_timestamp`. On Solana, `unix_timestamp` has slot-level granularity (~400ms). Two transactions in adjacent slots could have timestamps differing by < 2 seconds, providing effective rate limiting. However, within the same slot, `unix_timestamp` is identical, so the check `clock.unix_timestamp - last_oracle_timestamp >= 2` would always fail for same-slot transactions after the first one.

  This is actually a *stronger* guarantee than intended -- effectively one mint/redeem per slot after the initial one.

- **Impact:** None. The rate limit works as intended or better.

- **Status:** Acknowledged

---

### [INFO-03] `MAX_STALENESS_SECS = 120` Intended for Devnet Only

- **Severity:** INFORMATIONAL
- **Component:** `constants.rs:33`
- **Category:** Security Configuration (A05)
- **Description:**
  The comment says "120s for devnet, tighten for mainnet." On mainnet, Pyth publishes every ~400ms. A 120-second staleness window on mainnet would accept prices up to 2 minutes old, which is excessive for a DeFi protocol.

- **Impact:** On mainnet, stale prices could be used for mint/redeem within the 120s window.

- **Remediation:**
  For mainnet deployment:
  ```rust
  #[cfg(not(feature = "devnet"))]
  pub const MAX_STALENESS_SECS: u64 = 30; // 30s for mainnet

  #[cfg(feature = "devnet")]
  pub const MAX_STALENESS_SECS: u64 = 120; // 120s for devnet
  ```

- **Status:** Acknowledged (devnet-only)

---

### [INFO-04] No Timelock on Admin Parameter Changes

- **Severity:** INFORMATIONAL
- **Component:** `update_fee.rs`, `update_k.rs`, `pause.rs`, `update_min_lp_deposit.rs`, `accrue_funding.rs:209-217`
- **Category:** Governance / Trust Assumptions (A01)
- **Description:**
  The pool admin can instantly change `fee_bps`, `k` (when circulating == 0), `paused`, `min_lp_deposit`, and `funding_rate`. There is no timelock or multisig requirement. While the two-step authority transfer is a good pattern, LP providers and token holders have no advance notice of parameter changes.

- **Impact:** Trust assumption on admin. An admin could, for example:
  - Set `fee_bps = 0` to allow fee-free minting, then set `fee_bps = 100` before redemptions.
  - Lower `min_lp_deposit` to 1 to enable share inflation attacks.
  - Change `funding_rate` to maximum to rapidly decay `k`.

- **Remediation:**
  Consider a timelock for non-emergency parameter changes:
  ```rust
  pub struct PendingParamChange {
      pub new_value: u64,
      pub effective_after: i64, // unix timestamp
  }
  ```

  Or at minimum, document the trust assumptions clearly for LP providers.

- **Status:** Acknowledged (known trust assumption)

---

## Resolved Issues (from Architect Review)

The following 19 issues from the prior Architect review have been verified as resolved in the current codebase:

| # | Issue | Resolution |
|---|---|---|
| 1 | Missing `checked_*` arithmetic | All arithmetic uses `checked_*` with `MathOverflow` errors |
| 2 | No circuit breaker | `MIN_VAULT_RATIO_BPS = 9500` (95%) enforced in `redeem.rs:152-176` |
| 3 | No oracle staleness check | `MAX_STALENESS_SECS` enforced via Pyth `get_price_no_older_than` |
| 4 | No oracle confidence check | `MAX_CONFIDENCE_PCT = 2%` verified in `oracle.rs:108-111` |
| 5 | No price deviation check | Both `MAX_PRICE_DEVIATION_BPS` (15%) and `MAX_UPDATE_PRICE_DEVIATION_BPS` (50%) enforced |
| 6 | No minimum price floor | `MIN_PRICE = $1.00` checked in `oracle.rs:83` |
| 7 | No slippage protection | `min_tokens_out` / `min_usdc_out` parameters in mint/redeem |
| 8 | No rate limiting | `MIN_ACTION_INTERVAL_SECS = 2` enforced |
| 9 | No pause mechanism | `paused` flag checked in mint/redeem/add_liquidity/claim_lp_fees |
| 10 | Single-step authority transfer | Two-step: `transfer_authority` + `accept_authority` |
| 11 | No vault reconciliation | `vault_usdc.reload()` + balance assertion after every transfer |
| 12 | Fee not capped | `fee_bps <= 100` (1% max) in `update_fee.rs:23`, dynamic fee capped at 100 bps |
| 13 | k updatable with tokens in circulation | `require!(circulating == 0)` in `update_k.rs:25-27` |
| 14 | No `pool_id` length validation | `MAX_POOL_ID_LEN = 32` checked in `initialize.rs:59` |
| 15 | LP fee accumulator missing | Full accumulator system: `fee_per_share_accumulated` + `SHARE_PRECISION = 1e12` |
| 16 | LP principal not tracked | `lp_principal` field in PoolState, updated on add/remove liquidity |
| 17 | Admin can withdraw LP funds | `withdraw_fees` protects `lp_principal + total_lp_fees_pending` |
| 18 | No minimum LP deposit | `min_lp_deposit` enforced (default $100) |
| 19 | Funding elapsed overflow | `MAX_FUNDING_ELAPSED_SECS = 30 days` cap with carry-forward |

---

## Access Control Matrix

| Instruction | Signer | Authorization | Verified |
|---|---|---|---|
| `initialize` | `authority` | Any (becomes admin) | Yes -- PDA seeds prevent collision |
| `mint` | `user` | Permissionless | Yes |
| `redeem` | `user` | Permissionless | Yes |
| `update_price` | `payer` | Permissionless | Yes -- by design |
| `accrue_funding` | None required | Permissionless | Yes -- by design |
| `set_pause` | `authority` | `has_one = authority` | Yes |
| `update_k` | `authority` | `has_one = authority` | Yes |
| `update_fee` | `authority` | `has_one = authority` | Yes |
| `update_min_lp_deposit` | `authority` | `has_one = authority` | Yes |
| `withdraw_fees` | `authority` | `has_one = authority` | Yes |
| `transfer_authority` | `authority` | `has_one = authority` | Yes |
| `accept_authority` | `new_authority` | `== pool.pending_authority` | Yes |
| `initialize_lp` | `authority` | `has_one = authority` | Yes |
| `initialize_funding` | `admin` | `address = pool_state.authority` | Yes |
| `update_funding_rate` | `admin` | `address = pool_state.authority` | Yes |
| `add_liquidity` | `lp_provider` | Permissionless (min deposit) | Yes |
| `remove_liquidity` | `lp_provider` | Owns LP position (PDA) | Yes |
| `claim_lp_fees` | `lp_provider` | Owns LP position (PDA) | Yes |
| `create_metadata` | `authority` | `has_one = authority` | Yes |
| `migrate_pool` | `authority` | Manual discriminator + bytes[8..40] check | Yes |

---

## PDA Seed Verification

| PDA | Seeds | Collision-Safe |
|---|---|---|
| `pool_state` | `["pool", pool_id]` | Yes |
| `shortsol_mint` | `["shortsol_mint", pool_id]` | Yes |
| `mint_authority` | `["mint_auth", pool_id]` | Yes |
| `vault_usdc` | `["vault", usdc_mint, pool_id]` | Yes -- includes mint |
| `lp_mint` | `["lp_mint", pool_state]` | Yes |
| `lp_position` | `["lp_position", pool_state, lp_provider]` | Yes |
| `funding_config` | `["funding", pool_state]` | Yes |

---

## Dependency Audit

| Dependency | Version | Known CVEs | Status |
|---|---|---|---|
| `anchor-lang` | 0.32.1 | None known | OK |
| `anchor-spl` | 0.32.1 | None known | OK |
| `pyth-solana-receiver-sdk` | 1.1.0 | None known | OK |

Note: `cargo audit` was not available in the build environment. Manual review of Cargo.lock shows standard dependency tree with no flagged crates. Recommend running `cargo audit` in CI.

---

## Secrets Scan

| Check | Result |
|---|---|
| Hardcoded API keys | None found |
| Hardcoded passwords | None found |
| Hardcoded private keys | None found |
| `.env` files committed | No (`.gitignore` covers `.env`, `.env.*`, `*.keypair.json`) |
| Wallet paths in source | `scripts/` reference `~/solana-wallet.json` via env var -- acceptable for dev tooling |

---

## OWASP Top 10 Assessment (Solana-Adapted)

| Category | Status | Notes |
|---|---|---|
| **A01: Broken Access Control** | PASS | All admin ops use `has_one`/`address` constraints. Two-step authority transfer. |
| **A02: Cryptographic Failures** | PASS | PDA derivation correct. No custom crypto. Pyth signatures validated by SDK. |
| **A03: Injection** | MEDIUM | Oracle deviation walk (HIGH-01). No SQL/command injection applicable. |
| **A04: Insecure Design** | MEDIUM | LP share inflation risk (HIGH-02), optional funding (MEDIUM-02). |
| **A05: Security Misconfiguration** | LOW | Devnet staleness (INFO-03), migrate offsets (MEDIUM-01). |
| **A06: Vulnerable Components** | PASS | No known CVEs in dependencies. |
| **A07: Auth Failures** | PASS | Authority verified on all admin endpoints. |
| **A08: Integrity Failures** | PASS | Vault reconciliation after every CPI transfer. |
| **A09: Logging Failures** | LOW | Missing event in `update_min_lp_deposit` (LOW-02). |
| **A10: SSRF** | N/A | No outbound HTTP from on-chain program. |

---

## Security Checklist

- [x] No hardcoded secrets
- [x] All inputs validated (pool_id length, amounts > 0, fees capped)
- [x] Injection prevention verified (no string interpolation in queries; oracle validated)
- [x] Authentication/authorization verified (has_one, address constraints, two-step transfer)
- [x] Dependencies audited (manual review, no known CVEs)
- [x] Integer overflow/underflow checked (checked_* arithmetic throughout)
- [x] Vault reconciliation after every CPI transfer
- [x] Circuit breaker implemented (95% vault ratio)
- [x] Slippage protection on mint/redeem
- [x] Rate limiting implemented (2-second minimum interval)
- [x] Oracle staleness, confidence, and deviation checks
- [ ] Dead shares pattern for LP (defense-in-depth -- HIGH-02)
- [ ] USDC mint address validation in initialize (MEDIUM-05)
- [ ] Mandatory funding_config when enabled (MEDIUM-02)
- [ ] Minimum k floor to prevent decay to zero (MEDIUM-03)

---

## Recommendations Priority

| Priority | Finding | Effort |
|---|---|---|
| 1 (Before Mainnet) | HIGH-01: Narrow update_price deviation or add cooldown | Low |
| 2 (Before Mainnet) | HIGH-02: Add dead shares to LP system | Low |
| 3 (Before Mainnet) | MEDIUM-02: Make funding_config mandatory when initialized | Medium |
| 4 (Before Mainnet) | MEDIUM-05: Validate USDC mint address | Low |
| 5 (Before Mainnet) | MEDIUM-03: Add minimum k floor | Low |
| 6 (Improvement) | MEDIUM-01: Remove or refactor migrate_pool | Low |
| 7 (Improvement) | MEDIUM-04: Replace saturating_sub with checked_sub | Low |
| 8 (Improvement) | LOW-02: Add event to update_min_lp_deposit | Trivial |
| 9 (Improvement) | LOW-03: Restrict or narrow update_price | Low |
| 10 (Improvement) | INFO-03: Feature-flag staleness for mainnet | Trivial |

---

*End of Security Audit Report*
