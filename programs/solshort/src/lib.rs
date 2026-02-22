use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod oracle;
pub mod state;

use instructions::*;

declare_id!("CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX");

#[program]
pub mod solshort {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, pool_id: String, fee_bps: u16) -> Result<()> {
        instructions::initialize::handler(ctx, pool_id, fee_bps)
    }

    pub fn mint(ctx: Context<MintShortSol>, pool_id: String, usdc_amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, pool_id, usdc_amount)
    }

    pub fn redeem(
        ctx: Context<RedeemShortSol>,
        pool_id: String,
        shortsol_amount: u64,
    ) -> Result<()> {
        instructions::redeem::handler(ctx, pool_id, shortsol_amount)
    }

    pub fn update_k(ctx: Context<UpdateK>, pool_id: String, new_k: u128) -> Result<()> {
        instructions::update_k::handler(ctx, pool_id, new_k)
    }

    pub fn set_pause(ctx: Context<SetPause>, pool_id: String, paused: bool) -> Result<()> {
        instructions::pause::handler(ctx, pool_id, paused)
    }

    pub fn create_metadata(
        ctx: Context<CreateTokenMetadata>,
        pool_id: String,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        instructions::create_metadata::handler(ctx, pool_id, name, symbol, uri)
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        pool_id: String,
        usdc_amount: u64,
    ) -> Result<()> {
        instructions::add_liquidity::handler(ctx, pool_id, usdc_amount)
    }
}
