use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::state::{LpPosition, PoolState};

/// Calculate USDC obligations for all circulating shortSOL at given price
pub fn calc_obligations(circulating: u64, k: u128, sol_price: u64) -> Result<u64> {
    if circulating == 0 || sol_price == 0 {
        return Ok(0);
    }
    let shortsol_price: u128 = k
        .checked_mul(PRICE_PRECISION as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(sol_price as u128)
        .ok_or(error!(SolshortError::MathOverflow))?;

    let scaling = 10u64.pow((SHORTSOL_DECIMALS - USDC_DECIMALS) as u32) as u128;

    (circulating as u128)
        .checked_mul(shortsol_price)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(PRICE_PRECISION as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(scaling)
        .ok_or(error!(SolshortError::MathOverflow))?
        .try_into()
        .map_err(|_| error!(SolshortError::MathOverflow))
}

/// Calculate dynamic fee based on vault health ratio.
///
/// ratio > 200%   → fee = base / 2     (vault healthy, low fees)   →  2 bps
/// ratio 150-200% → fee = base * 5      (normal)                    → 20 bps
/// ratio 100-150% → fee = base * 10    (elevated)                  → 40 bps
/// ratio < 100%   → fee = base * 20    (critical, high fees)       → 80 bps
pub fn calc_dynamic_fee(
    base_fee_bps: u16,
    vault_balance: u64,
    circulating: u64,
    k: u128,
    sol_price: u64,
) -> Result<u16> {
    if circulating == 0 || sol_price == 0 {
        return Ok(base_fee_bps);
    }

    let obligations = calc_obligations(circulating, k, sol_price)?;
    if obligations == 0 {
        return Ok(base_fee_bps);
    }

    let ratio_bps = (vault_balance as u128)
        .checked_mul(BPS_DENOMINATOR as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(obligations as u128)
        .ok_or(error!(SolshortError::MathOverflow))? as u64;

    let fee = if ratio_bps > 20_000 {
        // > 200% — vault very healthy
        (base_fee_bps as u64) / 2
    } else if ratio_bps > 15_000 {
        // 150-200% — normal
        (base_fee_bps as u64) * 5
    } else if ratio_bps > 10_000 {
        // 100-150% — elevated
        (base_fee_bps as u64) * 10
    } else {
        // < 100% — critical
        (base_fee_bps as u64) * 20
    };

    // Clamp to max 100 bps (1%)
    Ok(fee.min(100) as u16)
}

/// Начисляет накопленные fees в pending_fees позиции LP.
/// Вызывается перед каждым deposit/withdraw/claim.
pub fn settle_lp_fees(pool: &PoolState, position: &mut LpPosition) -> Result<u64> {
    if position.lp_shares == 0 {
        position.fee_per_share_checkpoint = pool.fee_per_share_accumulated;
        return Ok(0);
    }
    let delta = pool
        .fee_per_share_accumulated
        .saturating_sub(position.fee_per_share_checkpoint);
    let earned = (delta as u128)
        .checked_mul(position.lp_shares as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(SHARE_PRECISION)
        .ok_or(error!(SolshortError::MathOverflow))? as u64;

    position.pending_fees = position
        .pending_fees
        .checked_add(earned)
        .ok_or(error!(SolshortError::MathOverflow))?;
    position.fee_per_share_checkpoint = pool.fee_per_share_accumulated;
    Ok(earned)
}

/// Вычисляет количество LP shares при депозите.
/// Использует dead shares (virtual offset) pattern для защиты от first-depositor
/// share inflation attack (HIGH-02, ERC-4626 defense-in-depth).
///
/// shares = usdc_amount * (lp_total_supply + VIRTUAL_SHARES) / (lp_principal + VIRTUAL_ASSETS)
///
/// При первом депозите: shares = usdc_amount * 1000 / 1000 = usdc_amount (same 1:1).
/// Virtual offset предотвращает манипуляцию share price через donation attack.
pub fn calc_lp_shares(
    usdc_amount: u64,
    lp_total_supply: u64,
    lp_principal: u64,
) -> Result<u64> {
    let total_shares = (lp_total_supply as u128)
        .checked_add(VIRTUAL_SHARES as u128)
        .ok_or(error!(SolshortError::MathOverflow))?;
    let total_assets = (lp_principal as u128)
        .checked_add(VIRTUAL_ASSETS as u128)
        .ok_or(error!(SolshortError::MathOverflow))?;

    (usdc_amount as u128)
        .checked_mul(total_shares)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(total_assets)
        .ok_or(error!(SolshortError::MathOverflow))?
        .try_into()
        .map_err(|_| error!(SolshortError::MathOverflow))
}

/// Обновляет глобальный fee accumulator после начисления fee_amount.
/// Если LP нет — fee остаётся в vault как protocol reserve.
pub fn accumulate_fee(pool: &mut PoolState, fee_amount: u64) -> Result<()> {
    if pool.lp_total_supply == 0 || fee_amount == 0 {
        return Ok(());
    }
    let delta = (fee_amount as u128)
        .checked_mul(SHARE_PRECISION)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(pool.lp_total_supply as u128)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.fee_per_share_accumulated = pool
        .fee_per_share_accumulated
        .checked_add(delta)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.total_lp_fees_pending = pool
        .total_lp_fees_pending
        .checked_add(fee_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    Ok(())
}
