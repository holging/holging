use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::TransferAuthorityEvent;
use crate::state::PoolState;

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

    /// CHECK: New authority, validated by being passed explicitly
    pub new_authority: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TransferAuthority>, _pool_id: String) -> Result<()> {
    let old = ctx.accounts.pool_state.authority;
    ctx.accounts.pool_state.authority = ctx.accounts.new_authority.key();

    emit!(TransferAuthorityEvent {
        old_authority: old,
        new_authority: ctx.accounts.new_authority.key(),
    });
    Ok(())
}
