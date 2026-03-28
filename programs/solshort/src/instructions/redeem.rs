use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::{CircuitBreakerTriggered, RedeemEvent};
use crate::fees::{accumulate_fee, calc_dynamic_fee};
use crate::instructions::accrue_funding::apply_funding_inline;
use crate::oracle::get_validated_price;
use crate::state::{FundingConfig, PoolState};

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct RedeemShortSol<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = shortsol_mint,
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(
        mut,
        seeds = [VAULT_SEED, usdc_mint.key().as_ref(), pool_id.as_bytes()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool_state,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub shortsol_mint: Account<'info, Mint>,

    pub price_update: Account<'info, PriceUpdateV2>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = shortsol_mint,
        token::authority = user,
    )]
    pub user_shortsol: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = user,
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// Опциональный FundingConfig — если передан, фандинг применяется инлайн
    /// перед вычислением shortsol_price. Если не передан, k остаётся текущим.
    #[account(
        mut,
        seeds = [FUNDING_SEED, pool_state.key().as_ref()],
        bump,
    )]
    pub funding_config: Option<Account<'info, FundingConfig>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RedeemShortSol>,
    pool_id: String,
    shortsol_amount: u64,
    min_usdc_out: u64,
) -> Result<()> {
    require!(!ctx.accounts.pool_state.paused, SolshortError::Paused);
    require!(shortsol_amount > 0, SolshortError::AmountTooSmall);

    // Rate limit check
    let clock = Clock::get()?;
    if ctx.accounts.pool_state.last_oracle_timestamp > 0 {
        require!(
            clock.unix_timestamp - ctx.accounts.pool_state.last_oracle_timestamp >= MIN_ACTION_INTERVAL_SECS,
            SolshortError::RateLimitExceeded
        );
    }

    // Применяем фандинг инлайн если FundingConfig передан
    if let Some(funding) = &mut ctx.accounts.funding_config {
        apply_funding_inline(&mut ctx.accounts.pool_state, funding, clock.unix_timestamp)?;
    }

    let pool = &mut ctx.accounts.pool_state;

    // 1. Get validated oracle price
    let oracle = get_validated_price(&ctx.accounts.price_update, pool.last_oracle_price)?;
    let sol_price = oracle.price;

    // 2. Calculate shortSOL price
    let shortsol_price: u64 = (pool.k)
        .checked_mul(PRICE_PRECISION as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(sol_price as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .try_into()
        .map_err(|_| error!(SolshortError::MathOverflow))?;

    // 3. Calculate gross USDC out
    let scaling = 10u64.pow((SHORTSOL_DECIMALS - USDC_DECIMALS) as u32); // 1000
    let gross_usdc: u64 = (shortsol_amount as u128)
        .checked_mul(shortsol_price as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(PRICE_PRECISION as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(scaling as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .try_into()
        .map_err(|_| error!(SolshortError::MathOverflow))?;

    // 4. Apply dynamic fee based on vault health
    let dynamic_fee_bps = calc_dynamic_fee(
        pool.fee_bps, pool.vault_balance, pool.circulating, pool.k, sol_price,
    )?;
    let fee_amount = (gross_usdc as u128)
        .checked_mul(dynamic_fee_bps as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(error!(SolshortError::MathOverflow))? as u64;

    let net_usdc = gross_usdc
        .checked_sub(fee_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;

    require!(net_usdc >= min_usdc_out, SolshortError::SlippageExceeded);

    // 5. Liquidity check
    require!(
        net_usdc <= pool.vault_balance,
        SolshortError::InsufficientLiquidity
    );

    // 6. Circuit breaker: check vault ratio after redemption
    let remaining_vault = pool
        .vault_balance
        .checked_sub(net_usdc)
        .ok_or(error!(SolshortError::InsufficientLiquidity))?;
    let remaining_circulating = pool
        .circulating
        .checked_sub(shortsol_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;

    if remaining_circulating > 0 {
        let obligations: u128 = (remaining_circulating as u128)
            .checked_mul(shortsol_price as u128)
            .ok_or(error!(SolshortError::MathOverflow))?
            .checked_div(PRICE_PRECISION as u128)
            .ok_or(error!(SolshortError::MathOverflow))?
            .checked_div(scaling as u128)
            .ok_or(error!(SolshortError::MathOverflow))?;

        if obligations > 0 {
            let ratio_bps = (remaining_vault as u128)
                .checked_mul(BPS_DENOMINATOR as u128)
                .ok_or(error!(SolshortError::MathOverflow))?
                .checked_div(obligations)
                .ok_or(error!(SolshortError::MathOverflow))?;

            if ratio_bps < MIN_VAULT_RATIO_BPS as u128 {
                emit!(CircuitBreakerTriggered {
                    vault_ratio_bps: ratio_bps as u64,
                    timestamp: oracle.timestamp,
                });
                return Err(error!(SolshortError::CircuitBreaker));
            }
        }
    }

    // 7. Burn shortSOL tokens from user
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.shortsol_mint.to_account_info(),
                from: ctx.accounts.user_shortsol.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        shortsol_amount,
    )?;

    // 8. Transfer USDC from vault to user (signed by pool_state PDA)
    let pool_seeds: &[&[u8]] = &[POOL_SEED, pool_id.as_bytes(), &[pool.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_usdc.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        net_usdc,
    )?;

    // 9. Reconcile vault balance
    ctx.accounts.vault_usdc.reload()?;
    require!(
        ctx.accounts.vault_usdc.amount >= remaining_vault,
        SolshortError::InsufficientLiquidity
    );

    // 10. Update pool state
    pool.circulating = remaining_circulating;
    pool.total_redeemed = pool
        .total_redeemed
        .checked_add(shortsol_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.vault_balance = remaining_vault;
    pool.total_fees_collected = pool
        .total_fees_collected
        .checked_add(fee_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.last_oracle_price = sol_price;
    pool.last_oracle_timestamp = oracle.timestamp;

    // 10a. Распределяем fee LP провайдерам через accumulator
    accumulate_fee(pool, fee_amount)?;

    // 11. Emit event
    emit!(RedeemEvent {
        user: ctx.accounts.user.key(),
        tokens_in: shortsol_amount,
        usdc_out: net_usdc,
        sol_price,
        shortsol_price,
        fee: fee_amount,
        timestamp: oracle.timestamp,
    });

    Ok(())
}
