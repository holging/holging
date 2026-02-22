use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PoolState {
    /// Admin authority
    pub authority: Pubkey,
    /// Normalizing constant k = P0^2 / PRICE_PRECISION, stored scaled by PRICE_PRECISION
    pub k: u128,
    /// Fee in basis points (4 = 0.04%)
    pub fee_bps: u16,
    /// Total shortSOL ever minted (in token base units, 1e9)
    pub total_minted: u64,
    /// Total shortSOL ever redeemed
    pub total_redeemed: u64,
    /// Current shortSOL in circulation
    pub circulating: u64,
    /// Cumulative fees collected (USDC, 1e6 precision)
    pub total_fees_collected: u64,
    /// Current USDC balance in vault (1e6 precision)
    pub vault_balance: u64,
    /// Pyth SOL/USD price feed account
    pub pyth_feed: Pubkey,
    /// shortSOL SPL token mint address
    pub shortsol_mint: Pubkey,
    /// Emergency pause flag
    pub paused: bool,
    /// Cached last oracle price (scaled 1e9)
    pub last_oracle_price: u64,
    /// Cached last oracle timestamp
    pub last_oracle_timestamp: i64,
    /// PDA bump seed
    pub bump: u8,
    /// Mint authority bump seed
    pub mint_auth_bump: u8,
}
