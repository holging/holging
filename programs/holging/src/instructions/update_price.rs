use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::oracle;
use crate::state::PoolState;

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct UpdatePrice<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
    )]
    pub pool_state: Account<'info, PoolState>,

    /// Pyth PriceUpdateV2 account (ephemeral, created per-transaction).
    /// Feed ID is validated inside `get_validated_price_no_deviation`.
    pub pyth_price: Account<'info, PriceUpdateV2>,

    pub payer: Signer<'info>,
}

pub fn handler(ctx: Context<UpdatePrice>, _pool_id: String) -> Result<()> {
    require!(_pool_id.len() <= MAX_POOL_ID_LEN, SolshortError::InvalidPoolId);
    let pool = &mut ctx.accounts.pool_state;

    let oracle_price = oracle::get_validated_price_wide_deviation(
        &ctx.accounts.pyth_price,
        pool.last_oracle_price,
    )?;

    let old_price = pool.last_oracle_price;
    pool.last_oracle_price = oracle_price.price;
    // NOTE: Do NOT update last_oracle_timestamp here.
    // Timestamp is only updated by mint/redeem to prevent
    // permissionless update_price from resetting the rate limit.

    msg!(
        "Price updated: {} -> {} at ts={}",
        old_price,
        oracle_price.price,
        oracle_price.timestamp
    );

    Ok(())
}
