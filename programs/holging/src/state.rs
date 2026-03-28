use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct FundingConfig {
    /// Funding rate in basis points per day (e.g. 10 = 0.10%/day)
    pub rate_bps: u16,
    /// Unix timestamp of last accrual
    pub last_funding_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl FundingConfig {
    pub const LEN: usize = 8 + Self::INIT_SPACE;
}

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
    /// Pending authority for two-step transfer (default = нет pending)
    pub pending_authority: Pubkey,

    // ─── LP система ───────────────────────────────────────────────────────────

    /// LP token SPL mint PDA (["lp_mint", pool_state])
    pub lp_mint: Pubkey,
    /// Зеркало lp_mint.supply — синхронизируется через reload после mint/burn
    pub lp_total_supply: u64,
    /// Глобальный аккумулятор fees per LP share (scaled × SHARE_PRECISION = 1e12)
    /// Растёт при каждом mint/redeem/accrue_funding
    pub fee_per_share_accumulated: u128,
    /// Сумма USDC внесённая LP провайдерами (principal, без накопленных fees)
    pub lp_principal: u64,
    /// Минимальный депозит LP в USDC base units
    pub min_lp_deposit: u64,
    /// Суммарные pending fees всех LP (для защиты admin withdraw_fees)
    pub total_lp_fees_pending: u64,
}

/// Позиция LP провайдера в конкретном пуле.
/// PDA seeds: ["lp_position", pool_state, owner]
#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    /// Владелец позиции
    pub owner: Pubkey,
    /// Пул к которому привязана позиция
    pub pool: Pubkey,
    /// Количество LP токенов у данного провайдера
    pub lp_shares: u64,
    /// Снимок fee_per_share_accumulated на момент последнего settle
    pub fee_per_share_checkpoint: u128,
    /// Начисленные но ещё не claimed USDC fees
    pub pending_fees: u64,
    /// PDA bump
    pub bump: u8,
}

impl LpPosition {
    pub const LEN: usize = 8 + Self::INIT_SPACE;
}
