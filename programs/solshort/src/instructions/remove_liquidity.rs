use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::RemoveLiquidityEvent;
use crate::oracle::get_validated_price;
use crate::state::PoolState;

use crate::fees::calc_obligations;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct RemoveLiquidity<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = pool_state,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub price_update: Account<'info, PriceUpdateV2>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = authority,
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RemoveLiquidity>, _pool_id: String, usdc_amount: u64) -> Result<()> {
    require!(usdc_amount > 0, SolshortError::AmountTooSmall);

    let pool = &mut ctx.accounts.pool_state;

    // Use fresh oracle price for obligation calculation
    let oracle = get_validated_price(&ctx.accounts.price_update, pool.last_oracle_price)?;
    let obligations = calc_obligations(pool.circulating, pool.k, oracle.price)?;

    let remaining = pool
        .vault_balance
        .checked_sub(usdc_amount)
        .ok_or(error!(SolshortError::InsufficientLiquidity))?;

    require!(remaining >= obligations, SolshortError::InsufficientLiquidity);

    // Transfer from vault to authority (signed by pool PDA)
    let pool_id_bytes = _pool_id.as_bytes();
    let pool_seeds: &[&[u8]] = &[POOL_SEED, pool_id_bytes, &[pool.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_usdc.to_account_info(),
                to: ctx.accounts.authority_usdc.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        usdc_amount,
    )?;

    pool.vault_balance = remaining;
    pool.last_oracle_price = oracle.price;
    pool.last_oracle_timestamp = oracle.timestamp;

    emit!(RemoveLiquidityEvent {
        authority: ctx.accounts.authority.key(),
        usdc_amount,
        remaining_vault: remaining,
    });

    Ok(())
}
