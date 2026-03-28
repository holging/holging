use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod fees;
pub mod instructions;
pub mod oracle;
pub mod state;

use instructions::*;

declare_id!("CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX");

#[program]
pub mod holging {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, pool_id: String, fee_bps: u16) -> Result<()> {
        instructions::initialize::handler(ctx, pool_id, fee_bps)
    }

    pub fn mint(ctx: Context<MintShortSol>, pool_id: String, usdc_amount: u64, min_tokens_out: u64) -> Result<()> {
        instructions::mint::handler(ctx, pool_id, usdc_amount, min_tokens_out)
    }

    pub fn redeem(
        ctx: Context<RedeemShortSol>,
        pool_id: String,
        shortsol_amount: u64,
        min_usdc_out: u64,
    ) -> Result<()> {
        instructions::redeem::handler(ctx, pool_id, shortsol_amount, min_usdc_out)
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

    pub fn update_price(ctx: Context<UpdatePrice>, pool_id: String) -> Result<()> {
        instructions::update_price::handler(ctx, pool_id)
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        pool_id: String,
        usdc_amount: u64,
    ) -> Result<()> {
        instructions::add_liquidity::handler(ctx, pool_id, usdc_amount)
    }

    pub fn withdraw_fees(
        ctx: Context<WithdrawFees>,
        pool_id: String,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_fees::handler(ctx, pool_id, amount)
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        pool_id: String,
        lp_shares_amount: u64,
    ) -> Result<()> {
        instructions::remove_liquidity::handler(ctx, pool_id, lp_shares_amount)
    }

    pub fn initialize_lp(
        ctx: Context<InitializeLp>,
        pool_id: String,
        min_lp_deposit: u64,
    ) -> Result<()> {
        instructions::initialize_lp::handler(ctx, pool_id, min_lp_deposit)
    }

    pub fn migrate_pool(ctx: Context<MigratePool>, pool_id: String) -> Result<()> {
        instructions::migrate_pool::handler(ctx, pool_id)
    }

    pub fn claim_lp_fees(ctx: Context<ClaimLpFees>, pool_id: String) -> Result<()> {
        instructions::claim_lp_fees::handler(ctx, pool_id)
    }

    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        pool_id: String,
    ) -> Result<()> {
        instructions::transfer_authority::handler(ctx, pool_id)
    }

    pub fn accept_authority(
        ctx: Context<AcceptAuthority>,
        pool_id: String,
    ) -> Result<()> {
        instructions::accept_authority::handler(ctx, pool_id)
    }

    pub fn update_fee(
        ctx: Context<UpdateFee>,
        pool_id: String,
        new_fee_bps: u16,
    ) -> Result<()> {
        instructions::update_fee::handler(ctx, pool_id, new_fee_bps)
    }

    pub fn initialize_funding(
        ctx: Context<InitializeFunding>,
        pool_id: String,
        rate_bps: u16,
    ) -> Result<()> {
        instructions::accrue_funding::initialize_funding_handler(ctx, pool_id, rate_bps)
    }

    pub fn accrue_funding(ctx: Context<AccrueFunding>, pool_id: String) -> Result<()> {
        instructions::accrue_funding::accrue_funding_handler(ctx, pool_id)
    }

    pub fn update_funding_rate(
        ctx: Context<UpdateFundingRate>,
        pool_id: String,
        new_rate_bps: u16,
    ) -> Result<()> {
        instructions::accrue_funding::update_funding_rate_handler(ctx, pool_id, new_rate_bps)
    }

    pub fn update_min_lp_deposit(
        ctx: Context<UpdateMinLpDeposit>,
        pool_id: String,
        new_min_lp_deposit: u64,
    ) -> Result<()> {
        instructions::update_min_lp_deposit::handler(ctx, pool_id, new_min_lp_deposit)
    }
}
