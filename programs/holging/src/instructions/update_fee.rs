use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::events::UpdateFeeEvent;
use crate::state::PoolState;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct UpdateFee<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
    )]
    pub pool_state: Account<'info, PoolState>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateFee>, _pool_id: String, new_fee_bps: u16) -> Result<()> {
    require!(new_fee_bps <= 100, SolshortError::InvalidFee); // max 1%
    let old_fee_bps = ctx.accounts.pool_state.fee_bps;
    ctx.accounts.pool_state.fee_bps = new_fee_bps;
    emit!(UpdateFeeEvent {
        old_fee_bps,
        new_fee_bps,
        authority: ctx.accounts.authority.key(),
    });
    Ok(())
}
