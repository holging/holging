use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::{FundingAccruedEvent, FundingDistributedEvent};
use crate::fees::{accumulate_fee, calc_obligations};
use crate::oracle::get_validated_price;
use crate::state::{FundingConfig, PoolState};

/// Применяет фандинг инлайн без эмиссии события.
/// Используется из mint/redeem для синхронного обновления k.
/// Продвигает last_funding_at только на elapsed_to_apply (не на now),
/// чтобы остаток времени не терялся.
pub fn apply_funding_inline(
    pool: &mut PoolState,
    cfg: &mut FundingConfig,
    now: i64,
) -> Result<()> {
    let elapsed = now.saturating_sub(cfg.last_funding_at);
    if elapsed <= 0 || cfg.rate_bps == 0 {
        return Ok(());
    }

    let elapsed_to_apply = (elapsed as u64).min(MAX_FUNDING_ELAPSED_SECS);
    let denom: u128 = SECS_PER_DAY as u128 * BPS_DENOMINATOR as u128;
    let reduction: u128 = cfg.rate_bps as u128 * elapsed_to_apply as u128;
    let factor_num = denom
        .checked_sub(reduction)
        .ok_or(error!(SolshortError::MathOverflow))?;
    require!(factor_num > 0, SolshortError::MathOverflow);

    let new_k = pool
        .k
        .checked_mul(factor_num)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(denom)
        .ok_or(error!(SolshortError::MathOverflow))?;

    // Apply MIN_K floor to prevent decay to zero (MEDIUM-03 fix)
    pool.k = new_k.max(MIN_K);

    cfg.last_funding_at = cfg
        .last_funding_at
        .saturating_add(elapsed_to_apply as i64);

    Ok(())
}

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

    /// Oracle price — для расчёта freed_usdc и распределения LP fees
    pub price_update: Account<'info, PriceUpdateV2>,
}

/// Permissionless — кто угодно может вызвать для применения фандинга (уменьшение k).
///
/// Формула: k_new = k_old × (denom − rate_bps × elapsed_to_apply) / denom
/// где denom = SECS_PER_DAY × BPS_DENOM = 86_400 × 10_000 = 864_000_000
///
/// elapsed ограничен MAX_FUNDING_ELAPSED_SECS (30 дней) за вызов.
/// Это предотвращает обнуление k при длительном простое keeper'а.
/// Остаток времени переносится на следующий вызов (last_funding_at ≠ now).
///
/// Пример: rate=10 bps/день → ~0.1%/день → ~30.6% compound/год.
pub fn accrue_funding_handler(ctx: Context<AccrueFunding>, _pool_id: String) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // Сохраняем значения до применения фандинга
    let k_old = ctx.accounts.pool_state.k;
    let circulating = ctx.accounts.pool_state.circulating;
    let cached_price = ctx.accounts.pool_state.last_oracle_price;
    let last_funding_before = ctx.accounts.funding_config.last_funding_at;
    let rate_bps = ctx.accounts.funding_config.rate_bps;

    // Применяем фандинг (уменьшает k, продвигает last_funding_at)
    apply_funding_inline(
        &mut ctx.accounts.pool_state,
        &mut ctx.accounts.funding_config,
        now,
    )?;

    let k_new = ctx.accounts.pool_state.k;

    // Если k не изменился — ничего не делаем
    if k_new == k_old {
        return Ok(());
    }

    let elapsed_applied = ctx.accounts.funding_config.last_funding_at
        .saturating_sub(last_funding_before);

    // Получаем цену оракула для расчёта freed USDC
    let feed_id = ctx.accounts.pool_state.pyth_feed_id;
    let oracle = get_validated_price(&ctx.accounts.price_update, cached_price, &feed_id)?;
    let sol_price = oracle.price;

    // freed_usdc = обязательства при k_old − обязательства при k_new
    // Эта разница освобождается из obligation coverage и идёт LP провайдерам
    let obligations_before = calc_obligations(circulating, k_old, sol_price)?;
    let obligations_after = calc_obligations(circulating, k_new, sol_price)?;
    let freed_usdc = obligations_before.saturating_sub(obligations_after);

    let fee_per_share_before = ctx.accounts.pool_state.fee_per_share_accumulated;
    if freed_usdc > 0 {
        accumulate_fee(&mut ctx.accounts.pool_state, freed_usdc)?;
    }
    let fee_per_share_delta = ctx.accounts.pool_state.fee_per_share_accumulated
        .saturating_sub(fee_per_share_before);

    ctx.accounts.pool_state.last_oracle_price = sol_price;
    // NOTE: Do NOT update last_oracle_timestamp here — it is used for
    // mint/redeem rate limiting. accrue_funding must not reset that clock.

    emit!(FundingAccruedEvent {
        k_before: k_old,
        k_after: k_new,
        elapsed_secs: elapsed_applied,
        rate_bps,
        timestamp: now,
    });

    if freed_usdc > 0 {
        emit!(FundingDistributedEvent {
            freed_usdc,
            fee_per_share_delta,
            k_before: k_old,
            k_after: k_new,
            sol_price,
            timestamp: now,
        });
    }

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
