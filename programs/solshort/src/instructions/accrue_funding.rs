use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::FundingAccruedEvent;
use crate::state::{FundingConfig, PoolState};

// ─── Initialize Funding ───────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct InitializeFunding<'info> {
    #[account(mut, address = pool_state.authority)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(
        init,
        payer = admin,
        space = FundingConfig::LEN,
        seeds = [FUNDING_SEED, pool_state.key().as_ref()],
        bump,
    )]
    pub funding_config: Account<'info, FundingConfig>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_funding_handler(
    ctx: Context<InitializeFunding>,
    _pool_id: String,
    rate_bps: u16,
) -> Result<()> {
    require!(rate_bps <= MAX_FUNDING_RATE_BPS, SolshortError::InvalidFee);
    let cfg = &mut ctx.accounts.funding_config;
    cfg.rate_bps = rate_bps;
    cfg.last_funding_at = Clock::get()?.unix_timestamp;
    cfg.bump = ctx.bumps.funding_config;
    Ok(())
}

// ─── Accrue Funding ───────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct AccrueFunding<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(
        mut,
        seeds = [FUNDING_SEED, pool_state.key().as_ref()],
        bump = funding_config.bump,
    )]
    pub funding_config: Account<'info, FundingConfig>,
}

/// Permissionless — anyone can call to drip funding into the vault by reducing k.
///
/// k_new = k_old × (SECS_PER_DAY × BPS_DENOM − rate_bps × elapsed_secs)
///                / (SECS_PER_DAY × BPS_DENOM)
pub fn accrue_funding_handler(ctx: Context<AccrueFunding>, _pool_id: String) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let cfg = &mut ctx.accounts.funding_config;
    let pool = &mut ctx.accounts.pool_state;

    let elapsed = now.saturating_sub(cfg.last_funding_at);
    if elapsed <= 0 || cfg.rate_bps == 0 {
        return Ok(());
    }

    // denom = SECS_PER_DAY × BPS_DENOM = 86400 × 10000 = 864_000_000
    let denom: u128 = SECS_PER_DAY as u128 * BPS_DENOMINATOR as u128;
    let reduction: u128 = cfg.rate_bps as u128 * elapsed as u128;

    // Saturate at zero (avoid underflow if elapsed is enormous)
    let factor_num = denom.saturating_sub(reduction);

    let k_old = pool.k;
    pool.k = k_old
        .checked_mul(factor_num)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(denom)
        .ok_or(error!(SolshortError::MathOverflow))?;

    cfg.last_funding_at = now;

    emit!(FundingAccruedEvent {
        k_before: k_old,
        k_after: pool.k,
        elapsed_secs: elapsed,
        rate_bps: cfg.rate_bps,
        timestamp: now,
    });

    Ok(())
}

// ─── Update Funding Rate ──────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct UpdateFundingRate<'info> {
    #[account(address = pool_state.authority)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(
        mut,
        seeds = [FUNDING_SEED, pool_state.key().as_ref()],
        bump = funding_config.bump,
    )]
    pub funding_config: Account<'info, FundingConfig>,
}

pub fn update_funding_rate_handler(
    ctx: Context<UpdateFundingRate>,
    _pool_id: String,
    new_rate_bps: u16,
) -> Result<()> {
    require!(new_rate_bps <= MAX_FUNDING_RATE_BPS, SolshortError::InvalidFee);
    ctx.accounts.funding_config.rate_bps = new_rate_bps;
    Ok(())
}
