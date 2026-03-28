use anchor_lang::prelude::*;

use crate::constants::*;
use crate::events::PauseEvent;
use crate::state::PoolState;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct SetPause<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
    )]
    pub pool_state: Account<'info, PoolState>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<SetPause>, _pool_id: String, paused: bool) -> Result<()> {
    ctx.accounts.pool_state.paused = paused;
    emit!(PauseEvent {
        paused,
        authority: ctx.accounts.authority.key(),
    });
    Ok(())
}
