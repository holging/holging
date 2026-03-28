use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::WithdrawFeesEvent;
use crate::fees::calc_obligations;
use crate::oracle::get_validated_price;
use crate::state::PoolState;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct WithdrawFees<'info> {
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

pub fn handler(ctx: Context<WithdrawFees>, _pool_id: String, amount: u64) -> Result<()> {
    require!(amount > 0, SolshortError::AmountTooSmall);

    let pool = &mut ctx.accounts.pool_state;

    // Use fresh oracle price for obligation calculation
    let feed_id = pool.pyth_feed_id;
    let oracle = get_validated_price(&ctx.accounts.price_update, pool.last_oracle_price, &feed_id)?;
    let sol_price = oracle.price;

    let obligations = calc_obligations(pool.circulating, pool.k, sol_price)?;

    // Withdrawable = vault_balance - min_vault (110% coverage), буфер 15% до circuit breaker
    let min_vault = (obligations as u128)
        .checked_mul(MIN_VAULT_POST_WITHDRAWAL_BPS as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(error!(SolshortError::MathOverflow))? as u64;
    // Защищаем LP principal и pending fees от вывода администратором
    let lp_reserved = pool
        .lp_principal
        .checked_add(pool.total_lp_fees_pending)
        .ok_or(error!(SolshortError::MathOverflow))?;
    let protected = min_vault
        .checked_add(lp_reserved)
        .ok_or(error!(SolshortError::MathOverflow))?;
    let withdrawable = pool
        .vault_balance
        .checked_sub(protected)
        .ok_or(error!(SolshortError::InsufficientLiquidity))?;

    require!(amount <= withdrawable, SolshortError::InsufficientLiquidity);

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
        amount,
    )?;

    let new_vault = pool
        .vault_balance
        .checked_sub(amount)
        .ok_or(error!(SolshortError::MathOverflow))?;

    // Reconcile: verify actual vault token balance matches expectation
    ctx.accounts.vault_usdc.reload()?;
    require!(
        ctx.accounts.vault_usdc.amount >= new_vault,
        SolshortError::InsufficientLiquidity
    );

    pool.vault_balance = new_vault;
    pool.last_oracle_price = sol_price;
    pool.last_oracle_timestamp = oracle.timestamp;

    emit!(WithdrawFeesEvent {
        authority: ctx.accounts.authority.key(),
        amount,
        remaining_vault: new_vault,
    });

    Ok(())
}
