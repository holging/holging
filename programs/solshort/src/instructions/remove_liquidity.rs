use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::LpWithdrawEvent;
use crate::fees::{calc_obligations, settle_lp_fees};
use crate::oracle::get_validated_price;
use crate::state::{LpPosition, PoolState};

/// Permissionless — LP провайдер сжигает свои LP токены и получает
/// пропорциональную долю USDC principal. Накопленные fees остаются в pending_fees
/// и снимаются отдельно через claim_lp_fees.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct RemoveLiquidity<'info> {
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

    /// LP token mint (PDA)
    #[account(
        mut,
        seeds = [LP_MINT_SEED, pool_state.key().as_ref()],
        bump,
        mint::authority = pool_state,
    )]
    pub lp_mint: Account<'info, Mint>,

    /// Позиция LP провайдера (PDA seeds: lp_position + pool + lp_provider)
    #[account(
        mut,
        seeds = [LP_POSITION_SEED, pool_state.key().as_ref(), lp_provider.key().as_ref()],
        bump = lp_position.bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    /// ATA LP провайдера с LP токенами (для burn)
    #[account(
        mut,
        token::mint = lp_mint,
        token::authority = lp_provider,
    )]
    pub lp_provider_lp_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    /// Куда вернуть USDC
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = lp_provider,
    )]
    pub lp_provider_usdc: Account<'info, TokenAccount>,

    /// Для проверки здоровья vault после вывода
    pub price_update: Account<'info, PriceUpdateV2>,

    #[account(mut)]
    pub lp_provider: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RemoveLiquidity>,
    pool_id: String,
    lp_shares_amount: u64,
) -> Result<()> {
    require!(lp_shares_amount > 0, SolshortError::AmountTooSmall);

    let pool = &mut ctx.accounts.pool_state;
    require!(!pool.paused, SolshortError::Paused);
    let position = &mut ctx.accounts.lp_position;

    require!(
        position.lp_shares >= lp_shares_amount,
        SolshortError::InsufficientLpShares
    );

    // Начисляем накопленные fees перед изменением позиции
    settle_lp_fees(pool, position)?;

    // Пропорциональный USDC из principal: usdc_out = shares × lp_principal / lp_total_supply
    let usdc_out: u64 = (lp_shares_amount as u128)
        .checked_mul(pool.lp_principal as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(pool.lp_total_supply as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .try_into()
        .map_err(|_| error!(SolshortError::MathOverflow))?;

    require!(usdc_out > 0, SolshortError::AmountTooSmall);

    // Проверяем здоровье vault после вывода (минимум 110% обязательств)
    let oracle = get_validated_price(&ctx.accounts.price_update, pool.last_oracle_price)?;
    let obligations = calc_obligations(pool.circulating, pool.k, oracle.price)?;

    let remaining = pool
        .vault_balance
        .checked_sub(usdc_out)
        .ok_or(error!(SolshortError::InsufficientLiquidity))?;

    let min_vault = (obligations as u128)
        .checked_mul(MIN_VAULT_POST_WITHDRAWAL_BPS as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(error!(SolshortError::MathOverflow))? as u64;

    require!(remaining >= min_vault, SolshortError::InsufficientLiquidity);

    // Сжигаем LP токены (подписывает сам lp_provider — владелец ATA)
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.lp_mint.to_account_info(),
                from: ctx.accounts.lp_provider_lp_ata.to_account_info(),
                authority: ctx.accounts.lp_provider.to_account_info(),
            },
        ),
        lp_shares_amount,
    )?;

    // Переводим USDC из vault провайдеру (подписывает pool_state PDA)
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
        usdc_out,
    )?;

    // Обновляем позицию
    position.lp_shares = position
        .lp_shares
        .checked_sub(lp_shares_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;

    // Обновляем pool state
    pool.lp_total_supply = pool
        .lp_total_supply
        .checked_sub(lp_shares_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.lp_principal = pool
        .lp_principal
        .checked_sub(usdc_out)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.vault_balance = remaining;
    pool.last_oracle_price = oracle.price;
    pool.last_oracle_timestamp = oracle.timestamp;

    emit!(LpWithdrawEvent {
        lp_provider: ctx.accounts.lp_provider.key(),
        lp_shares_burned: lp_shares_amount,
        usdc_returned: usdc_out,
        new_lp_total_supply: pool.lp_total_supply,
        new_lp_principal: pool.lp_principal,
    });

    Ok(())
}
