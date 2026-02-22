use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::MintEvent;
use crate::oracle::get_validated_price;
use crate::state::PoolState;

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

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MintShortSol>, pool_id: String, usdc_amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool_state;
    require!(!pool.paused, SolshortError::Paused);
    require!(usdc_amount > 0, SolshortError::AmountTooSmall);

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

    // 3. Calculate fee
    let fee_amount = (usdc_amount as u128)
        .checked_mul(pool.fee_bps as u128)
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

    // 7. Update pool state
    pool.circulating = pool
        .circulating
        .checked_add(tokens)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.total_minted = pool
        .total_minted
        .checked_add(tokens)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.vault_balance = pool
        .vault_balance
        .checked_add(usdc_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.total_fees_collected = pool
        .total_fees_collected
        .checked_add(fee_amount)
        .ok_or(error!(SolshortError::MathOverflow))?;
    pool.last_oracle_price = sol_price;
    pool.last_oracle_timestamp = oracle.timestamp;

    // 8. Emit event
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
