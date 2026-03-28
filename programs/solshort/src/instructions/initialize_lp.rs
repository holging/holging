use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, InitializeMint, Mint, Token};

use crate::constants::*;
use crate::errors::SolshortError;
use crate::state::PoolState;

/// Admin создаёт LP mint для существующего пула.
/// Вызывается один раз после migrate_pool (или сразу для новых пулов).
/// Использует ручной CPI (create_account + initialize_mint) как в initialize.rs,
/// чтобы не зависеть от token_2022 feature.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct InitializeLp<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
    )]
    pub pool_state: Account<'info, PoolState>,

    /// CHECK: LP mint PDA — создаётся вручную через CPI
    #[account(
        mut,
        seeds = [LP_MINT_SEED, pool_state.key().as_ref()],
        bump,
    )]
    pub lp_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeLp>,
    _pool_id: String,
    min_lp_deposit: u64,
) -> Result<()> {
    require!(min_lp_deposit > 0, SolshortError::AmountTooSmall);
    require!(
        ctx.accounts.pool_state.lp_mint == Pubkey::default(),
        SolshortError::LpNotInitialized // уже инициализирован — защита от повторного вызова
    );

    // Сохраняем ключи до мутабельного borrow
    let lp_mint_bump = ctx.bumps.lp_mint;
    let pool_state_key = ctx.accounts.pool_state.key();
    let mint_seeds: &[&[u8]] = &[LP_MINT_SEED, pool_state_key.as_ref(), &[lp_mint_bump]];

    let mint_size = Mint::LEN;
    let mint_lamports = ctx.accounts.rent.minimum_balance(mint_size);

    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.lp_mint.to_account_info(),
            },
            &[mint_seeds],
        ),
        mint_lamports,
        mint_size as u64,
        ctx.accounts.token_program.key,
    )?;

    // Инициализируем mint (authority = pool_state PDA)
    token::initialize_mint(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint {
                mint: ctx.accounts.lp_mint.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        ),
        LP_TOKEN_DECIMALS,
        &pool_state_key,
        None,
    )?;

    // Записываем LP mint в pool state
    let pool = &mut ctx.accounts.pool_state;
    pool.lp_mint = ctx.accounts.lp_mint.key();
    pool.lp_total_supply = 0;
    pool.fee_per_share_accumulated = 0;
    pool.lp_principal = 0;
    pool.min_lp_deposit = min_lp_deposit;
    pool.total_lp_fees_pending = 0;

    Ok(())
}
