use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::state::PoolState;

#[event]
pub struct UpdateMinLpDepositEvent {
    pub old_min_lp_deposit: u64,
    pub new_min_lp_deposit: u64,
    pub authority: Pubkey,
}

/// Admin-only: обновить минимальный порог LP депозита.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct UpdateMinLpDeposit<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
    )]
    pub pool_state: Account<'info, PoolState>,

    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateMinLpDeposit>,
    _pool_id: String,
    new_min_lp_deposit: u64,
) -> Result<()> {
    require!(new_min_lp_deposit > 0, SolshortError::AmountTooSmall);
    let old = ctx.accounts.pool_state.min_lp_deposit;
    ctx.accounts.pool_state.min_lp_deposit = new_min_lp_deposit;

    emit!(UpdateMinLpDepositEvent {
        old_min_lp_deposit: old,
        new_min_lp_deposit,
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}
