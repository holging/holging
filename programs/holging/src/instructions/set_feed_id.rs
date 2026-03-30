use anchor_lang::prelude::*;
use crate::state::PoolState;
use crate::errors::SolshortError;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct SetFeedId<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool_id.as_bytes()],
        bump,
        has_one = authority @ SolshortError::Unauthorized,
    )]
    pub pool_state: Account<'info, PoolState>,
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<SetFeedId>, _pool_id: String, pyth_feed_id: [u8; 64]) -> Result<()> {
    let pool = &mut ctx.accounts.pool_state;
    pool.pyth_feed_id = pyth_feed_id;
    msg!("Feed ID updated for pool");
    Ok(())
}
