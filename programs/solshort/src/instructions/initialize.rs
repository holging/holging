use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, InitializeAccount, InitializeMint, Mint, Token, TokenAccount};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::oracle::get_validated_price;
use crate::state::PoolState;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PoolState::INIT_SPACE,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump,
    )]
    pub pool_state: Account<'info, PoolState>,

    /// CHECK: Mint account to be initialized via CPI (PDA)
    #[account(
        mut,
        seeds = [SHORTSOL_MINT_SEED, pool_id.as_bytes()],
        bump,
    )]
    pub shortsol_mint: UncheckedAccount<'info>,

    /// CHECK: PDA used as mint authority, verified by seeds
    #[account(
        seeds = [MINT_AUTH_SEED, pool_id.as_bytes()],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// CHECK: Vault token account to be initialized via CPI (PDA)
    #[account(
        mut,
        seeds = [VAULT_SEED, usdc_mint.key().as_ref(), pool_id.as_bytes()],
        bump,
    )]
    pub vault_usdc: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,

    pub price_update: Account<'info, PriceUpdateV2>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>, pool_id: String, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= 100, SolshortError::InvalidFee); // max 1%

    let pool_bump = ctx.bumps.pool_state;
    let mint_bump = ctx.bumps.shortsol_mint;
    let mint_auth_bump = ctx.bumps.mint_authority;
    let vault_bump = ctx.bumps.vault_usdc;

    // Create shortSOL mint account (PDA)
    let mint_seeds: &[&[u8]] = &[SHORTSOL_MINT_SEED, pool_id.as_bytes(), &[mint_bump]];
    let mint_size = Mint::LEN;
    let mint_lamports = ctx.accounts.rent.minimum_balance(mint_size);

    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.shortsol_mint.to_account_info(),
            },
            &[mint_seeds],
        ),
        mint_lamports,
        mint_size as u64,
        ctx.accounts.token_program.key,
    )?;

    // Initialize the mint
    let mint_auth_key = ctx.accounts.mint_authority.key();
    token::initialize_mint(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint {
                mint: ctx.accounts.shortsol_mint.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        ),
        SHORTSOL_DECIMALS,
        &mint_auth_key,
        None, // no freeze authority
    )?;

    // Create vault USDC token account (PDA)
    let usdc_mint_key = ctx.accounts.usdc_mint.key();
    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        usdc_mint_key.as_ref(),
        pool_id.as_bytes(),
        &[vault_bump],
    ];
    let vault_size = TokenAccount::LEN;
    let vault_lamports = ctx.accounts.rent.minimum_balance(vault_size);

    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.vault_usdc.to_account_info(),
            },
            &[vault_seeds],
        ),
        vault_lamports,
        vault_size as u64,
        ctx.accounts.token_program.key,
    )?;

    // Initialize the token account (owned by pool_state PDA)
    token::initialize_account(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeAccount {
                account: ctx.accounts.vault_usdc.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                authority: ctx.accounts.pool_state.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        ),
    )?;

    // Read initial SOL price from Pyth to compute k = P0^2 / PRICE_PRECISION
    let oracle = get_validated_price(&ctx.accounts.price_update, 0)?;
    let sol_price = oracle.price; // scaled 1e9

    // k = sol_price^2 / PRICE_PRECISION
    // so that shortSOL(0) = k * PRICE_PRECISION / sol_price = sol_price
    let k: u128 = (sol_price as u128)
        .checked_mul(sol_price as u128)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(PRICE_PRECISION as u128)
        .ok_or(error!(SolshortError::MathOverflow))?;

    let pool = &mut ctx.accounts.pool_state;
    pool.authority = ctx.accounts.authority.key();
    pool.k = k;
    pool.fee_bps = fee_bps;
    pool.total_minted = 0;
    pool.total_redeemed = 0;
    pool.circulating = 0;
    pool.total_fees_collected = 0;
    pool.vault_balance = 0;
    pool.pyth_feed = ctx.accounts.price_update.key();
    pool.shortsol_mint = ctx.accounts.shortsol_mint.key();
    pool.paused = false;
    pool.last_oracle_price = sol_price;
    pool.last_oracle_timestamp = oracle.timestamp;
    pool.bump = pool_bump;
    pool.mint_auth_bump = mint_auth_bump;

    msg!(
        "Pool initialized: k={}, sol_price={}, fee_bps={}",
        k,
        sol_price,
        fee_bps
    );

    Ok(())
}
