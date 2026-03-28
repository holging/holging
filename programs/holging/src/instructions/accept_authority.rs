use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::TransferAuthorityEvent;
use crate::state::PoolState;

/// Шаг 2 из 2: pending_authority подписывает и принимает управление.
/// Сбрасывает pending_authority в default после завершения.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
    )]
    pub pool_state: Account<'info, PoolState>,

    /// Должен совпадать с pool_state.pending_authority
    pub new_authority: Signer<'info>,
}

pub fn handler(ctx: Context<AcceptAuthority>, _pool_id: String) -> Result<()> {
    let pool = &mut ctx.accounts.pool_state;

    require!(
        pool.pending_authority != Pubkey::default(),
        SolshortError::NoPendingAuthority
    );
    require!(
        pool.pending_authority == ctx.accounts.new_authority.key(),
        SolshortError::Unauthorized
    );

    let old_authority = pool.authority;
    pool.authority = pool.pending_authority;
    pool.pending_authority = Pubkey::default();

    emit!(TransferAuthorityEvent {
        old_authority,
        new_authority: pool.authority,
    });

    Ok(())
}
