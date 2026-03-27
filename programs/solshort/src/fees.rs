use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;

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
/// ratio > 200%   → fee = base / 2    (vault healthy, low fees)
/// ratio 150-200% → fee = base        (normal)
/// ratio 100-150% → fee = base * 5/2  (elevated)
/// ratio < 100%   → fee = base * 5    (critical, high fees)
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
        base_fee_bps as u64
    } else if ratio_bps > 10_000 {
        // 100-150% — elevated
        (base_fee_bps as u64) * 5 / 2
    } else {
        // < 100% — critical
        (base_fee_bps as u64) * 5
    };

    // Clamp to max 100 bps (1%)
    Ok(fee.min(100) as u16)
}
