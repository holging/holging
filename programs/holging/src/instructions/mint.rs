use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::MintEvent;
use crate::fees::{accumulate_fee, calc_dynamic_fee};
use crate::instructions::accrue_funding::apply_funding_inline;
use crate::oracle::get_validated_price;
use crate::state::{FundingConfig, PoolState};

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct MintShortSol<'info> {
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

    /// CHECK: PDA mint authority, verified by seeds
    #[account(
        seeds = [MINT_AUTH_SEED, pool_id.as_bytes()],
        bump = pool_state.mint_auth_bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub price_update: Account<'info, PriceUpdateV2>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = user,
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    /// User's shortSOL associated token account.
    /// Must be created before calling mint (or use create_idempotent on client).
    #[account(
        mut,
        token::mint = shortsol_mint,
        token::authority = user,
    )]
    pub user_shortsol: Account<'info, TokenAccount>,

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

pub fn handler(ctx: Context<MintShortSol>, pool_id: String, usdc_amount: u64, min_tokens_out: u64) -> Result<()> {
    require!(!ctx.accounts.pool_state.paused, SolshortError::Paused);
    require!(usdc_amount > 0, SolshortError::AmountTooSmall);

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
    let sol_price = oracle.price; // scaled 1e9

    // 2. Calculate shortSOL price: shortsol_price = k * PRICE_PRECISION / sol_price
    let shortsol_price: u64 = (pool.k)
        .checked_mul(PRICE_PRECISION as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(sol_price as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .try_into()
        .map_err(|_| error!(SolshortError::MathOverflow))?;

    // 3. Calculate dynamic fee based on vault health
    let dynamic_fee_bps = calc_dynamic_fee(
        pool.fee_bps, pool.vault_balance, pool.circulating, pool.k, sol_price,
    )?;
    let fee_amount = (usdc_amount as u128)
        .checked_mul(dynamic_fee_bps as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(error!(SolshortError::MathOverflow))? as u64;

    let effective_usdc = usdc_amount
        .checked_sub(fee_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;

    // 4. Calculate tokens to mint
    // USDC is 1e6, shortSOL is 1e9 → scaling factor 10^3
    let scaling = 10u64.pow((SHORTSOL_DECIMALS - USDC_DECIMALS) as u32); // 1000
    let tokens: u64 = (effective_usdc as u128)
        .checked_mul(scaling as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_mul(PRICE_PRECISION as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(shortsol_price as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .try_into()
        .map_err(|_| error!(SolshortError::MathOverflow))?;

    require!(tokens > 0, SolshortError::AmountTooSmall);
    require!(tokens >= min_tokens_out, SolshortError::SlippageExceeded);

    // 5. Transfer USDC from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.vault_usdc.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        usdc_amount,
    )?;

    // 6. Mint shortSOL tokens to user (signed by mint_authority PDA)
    let mint_auth_seeds: &[&[u8]] = &[MINT_AUTH_SEED, pool_id.as_bytes(), &[pool.mint_auth_bump]];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.shortsol_mint.to_account_info(),
                to: ctx.accounts.user_shortsol.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            &[mint_auth_seeds],
        ),
        tokens,
    )?;

    // 7. Reconcile vault balance
    ctx.accounts.vault_usdc.reload()?;
    let expected_vault = pool
        .vault_balance
        .checked_add(usdc_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    require!(
        ctx.accounts.vault_usdc.amount >= expected_vault,
        SolshortError::InsufficientLiquidity
    );

    // 8. Update pool state (reconciled)
    pool.circulating = pool
        .circulating
        .checked_add(tokens)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.total_minted = pool
        .total_minted
        .checked_add(tokens)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.vault_balance = expected_vault;
    pool.total_fees_collected = pool
        .total_fees_collected
        .checked_add(fee_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.last_oracle_price = sol_price;
    pool.last_oracle_timestamp = oracle.timestamp;

    // 8a. Распределяем fee LP провайдерам через accumulator
    accumulate_fee(pool, fee_amount)?;

    // 9. Emit event
    emit!(MintEvent {
        user: ctx.accounts.user.key(),
        usdc_in: usdc_amount,
        tokens_out: tokens,
        sol_price,
        shortsol_price,
        fee: fee_amount,
        timestamp: oracle.timestamp,
    });

    Ok(())
}
