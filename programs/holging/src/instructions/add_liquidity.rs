use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::LpDepositEvent;
use crate::fees::{calc_lp_shares, settle_lp_fees};
use crate::state::{LpPosition, PoolState};

/// Permissionless — любой может стать LP провайдером.
/// Минимальный депозит: pool_state.min_lp_deposit.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct AddLiquidity<'info> {
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

    /// LP token mint (PDA, создан через initialize_lp)
    #[account(
        mut,
        seeds = [LP_MINT_SEED, pool_state.key().as_ref()],
        bump,
        mint::authority = pool_state,
    )]
    pub lp_mint: Account<'info, Mint>,

    /// Позиция LP провайдера — создаётся при первом депозите
    #[account(
        init_if_needed,
        payer = lp_provider,
        space = LpPosition::LEN,
        seeds = [LP_POSITION_SEED, pool_state.key().as_ref(), lp_provider.key().as_ref()],
        bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    /// ATA LP провайдера для LP токенов — создаётся если не существует
    #[account(
        init_if_needed,
        payer = lp_provider,
        associated_token::mint = lp_mint,
        associated_token::authority = lp_provider,
    )]
    pub lp_provider_lp_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = lp_provider,
    )]
    pub lp_provider_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_provider: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddLiquidity>, pool_id: String, usdc_amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool_state;

    require!(!pool.paused, SolshortError::Paused);
    // LP система должна быть инициализирована
    require!(pool.lp_mint != Pubkey::default(), SolshortError::LpNotInitialized);
    require!(usdc_amount >= pool.min_lp_deposit, SolshortError::BelowMinLpDeposit);

    let position = &mut ctx.accounts.lp_position;

    // Инициализируем позицию при первом вызове
    if position.owner == Pubkey::default() {
        position.owner = ctx.accounts.lp_provider.key();
        position.pool = pool.key();
        position.lp_shares = 0;
        position.fee_per_share_checkpoint = pool.fee_per_share_accumulated;
        position.pending_fees = 0;
        position.bump = ctx.bumps.lp_position;
    }

    // Начисляем накопленные fees перед изменением позиции
    settle_lp_fees(pool, position)?;

    // Рассчитываем количество LP shares
    let shares = calc_lp_shares(usdc_amount, pool.lp_total_supply, pool.lp_principal)?;
    require!(shares > 0, SolshortError::AmountTooSmall);

    // Переводим USDC от провайдера в vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.lp_provider_usdc.to_account_info(),
                to: ctx.accounts.vault_usdc.to_account_info(),
                authority: ctx.accounts.lp_provider.to_account_info(),
            },
        ),
        usdc_amount,
    )?;

    // Минтим LP токены провайдеру (подписывает pool_state PDA)
    let pool_seeds: &[&[u8]] = &[POOL_SEED, pool_id.as_bytes(), &[pool.bump]];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.lp_mint.to_account_info(),
                to: ctx.accounts.lp_provider_lp_ata.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        shares,
    )?;

    // Обновляем позицию и pool state
    position.lp_shares = position
        .lp_shares
        .checked_add(shares)
        .ok_or(error!(SolshortError::MathOverflow))?;
    position.fee_per_share_checkpoint = pool.fee_per_share_accumulated;

    pool.lp_total_supply = pool
        .lp_total_supply
        .checked_add(shares)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.lp_principal = pool
        .lp_principal
        .checked_add(usdc_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.vault_balance = pool
        .vault_balance
        .checked_add(usdc_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;

    emit!(LpDepositEvent {
        lp_provider: ctx.accounts.lp_provider.key(),
        usdc_amount,
        lp_shares_minted: shares,
        new_lp_total_supply: pool.lp_total_supply,
        new_lp_principal: pool.lp_principal,
    });

    Ok(())
}
