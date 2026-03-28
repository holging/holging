use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::PoolState;

/// Реалоцирует on-chain аккаунт PoolState до нового размера с LP полями.
/// Вызывается один раз admin'ом для существующих пулов.
/// Для новых пулов (после обновления программы) migrate не нужен —
/// initialize создаёт аккаунт уже нужного размера.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct MigratePool<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
        realloc = 8 + PoolState::INIT_SPACE,
        realloc::payer = authority,
        realloc::zero = false,
    )]
    pub pool_state: Account<'info, PoolState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigratePool>, _pool_id: String) -> Result<()> {
    let pool = &mut ctx.accounts.pool_state;

    // Инициализируем новые LP поля в безопасные значения по умолчанию.
    // realloc::zero = false оставляет мусор в новых байтах — явно обнуляем.
    if pool.lp_mint == Pubkey::default() {
        pool.lp_total_supply = 0;
        pool.fee_per_share_accumulated = 0;
        pool.lp_principal = 0;
        pool.min_lp_deposit = MIN_LP_DEPOSIT;
        pool.total_lp_fees_pending = 0;
    }

    Ok(())
}
