use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::UpdateKEvent;
use crate::state::PoolState;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct UpdateK<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
    )]
    pub pool_state: Account<'info, PoolState>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateK>, _pool_id: String, new_k: u128) -> Result<()> {
    require!(new_k > 0, SolshortError::AmountTooSmall);
    require!(
        ctx.accounts.pool_state.circulating == 0,
        SolshortError::CirculatingNotZero
    );
    ctx.accounts.pool_state.k = new_k;
    emit!(UpdateKEvent {
        new_k,
        authority: ctx.accounts.authority.key(),
    });
    Ok(())
}
