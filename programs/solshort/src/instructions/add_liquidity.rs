use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::AddLiquidityEvent;
use crate::state::PoolState;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct AddLiquidity<'info> {
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

pub fn handler(ctx: Context<AddLiquidity>, _pool_id: String, usdc_amount: u64) -> Result<()> {
    require!(usdc_amount > 0, SolshortError::AmountTooSmall);

    // Transfer USDC from authority to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.authority_usdc.to_account_info(),
                to: ctx.accounts.vault_usdc.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        usdc_amount,
    )?;

    // Update pool vault balance
    let pool = &mut ctx.accounts.pool_state;
    pool.vault_balance = pool
        .vault_balance
        .checked_add(usdc_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;

    emit!(AddLiquidityEvent {
        authority: ctx.accounts.authority.key(),
        usdc_amount,
        new_vault_balance: pool.vault_balance,
    });

    Ok(())
}
