use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::LpFeeClaimedEvent;
use crate::fees::settle_lp_fees;
use crate::state::{LpPosition, PoolState};

/// LP провайдер снимает накопленные USDC fees.
/// settle_lp_fees начисляет все незафиксированные fees в pending_fees перед выплатой.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct ClaimLpFees<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
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

    /// Позиция LP провайдера
    #[account(
        mut,
        seeds = [LP_POSITION_SEED, pool_state.key().as_ref(), lp_provider.key().as_ref()],
        bump = lp_position.bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    pub usdc_mint: Account<'info, Mint>,

    /// Куда перевести USDC fees
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = lp_provider,
    )]
    pub lp_provider_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_provider: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimLpFees>, pool_id: String) -> Result<()> {
    let pool = &mut ctx.accounts.pool_state;
    require!(!pool.paused, SolshortError::Paused);
    let position = &mut ctx.accounts.lp_position;

    // Начисляем все незафиксированные fees в pending_fees
    settle_lp_fees(pool, position)?;

    let amount = position.pending_fees;
    require!(amount > 0, SolshortError::NoFeesToClaim);
    require!(amount <= pool.vault_balance, SolshortError::InsufficientLiquidity);

    // Переводим USDC из vault LP провайдеру (подписывает pool_state PDA)
    let pool_seeds: &[&[u8]] = &[POOL_SEED, pool_id.as_bytes(), &[pool.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_usdc.to_account_info(),
                to: ctx.accounts.lp_provider_usdc.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        amount,
    )?;

    let fee_per_share_at_claim = pool.fee_per_share_accumulated;

    // Обнуляем pending_fees в позиции
    position.pending_fees = 0;

    // Уменьшаем суммарные LP fees и vault balance
    pool.total_lp_fees_pending = pool.total_lp_fees_pending.saturating_sub(amount);
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

    emit!(LpFeeClaimedEvent {
        lp_owner: ctx.accounts.lp_provider.key(),
        usdc_claimed: amount,
        fee_per_share_at_claim,
    });

    Ok(())
}
