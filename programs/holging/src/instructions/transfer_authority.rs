use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::ProposeAuthorityEvent;
use crate::state::PoolState;

/// Шаг 1 из 2: текущий authority предлагает нового.
/// Новый authority должен принять через accept_authority.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct TransferAuthority<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
    )]
    pub pool_state: Account<'info, PoolState>,

    pub authority: Signer<'info>,

    /// CHECK: Предлагаемый новый authority
    pub new_authority: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferAuthority>, _pool_id: String) -> Result<()> {
    ctx.accounts.pool_state.pending_authority = ctx.accounts.new_authority.key();

    emit!(ProposeAuthorityEvent {
        current_authority: ctx.accounts.authority.key(),
        proposed_authority: ctx.accounts.new_authority.key(),
    });
    Ok(())
}
