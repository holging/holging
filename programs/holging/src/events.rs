use anchor_lang::prelude::*;

#[event]
pub struct MintEvent {
    pub user: Pubkey,
    pub usdc_in: u64,
    pub tokens_out: u64,
    pub sol_price: u64,
    pub shortsol_price: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemEvent {
    pub user: Pubkey,
    pub tokens_in: u64,
    pub usdc_out: u64,
    pub sol_price: u64,
    pub shortsol_price: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct CircuitBreakerTriggered {
    pub vault_ratio_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct AddLiquidityEvent {
    pub authority: Pubkey,
    pub usdc_amount: u64,
    pub new_vault_balance: u64,
}

#[event]
pub struct WithdrawFeesEvent {
    pub authority: Pubkey,
    pub amount: u64,
    pub remaining_vault: u64,
}

#[event]
pub struct RemoveLiquidityEvent {
    pub authority: Pubkey,
    pub usdc_amount: u64,
    pub remaining_vault: u64,
}

#[event]
pub struct ProposeAuthorityEvent {
    pub current_authority: Pubkey,
    pub proposed_authority: Pubkey,
}

#[event]
pub struct TransferAuthorityEvent {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct PauseEvent {
    pub paused: bool,
    pub authority: Pubkey,
}

#[event]
pub struct UpdateFeeEvent {
    pub old_fee_bps: u16,
    pub new_fee_bps: u16,
    pub authority: Pubkey,
}

#[event]
pub struct UpdateKEvent {
    pub new_k: u128,
    pub authority: Pubkey,
}

#[event]
pub struct FundingAccruedEvent {
    pub k_before: u128,
    pub k_after: u128,
    pub elapsed_secs: i64,
    pub rate_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct LpDepositEvent {
    pub lp_provider: Pubkey,
    pub usdc_amount: u64,
    pub lp_shares_minted: u64,
    pub new_lp_total_supply: u64,
    pub new_lp_principal: u64,
}

#[event]
pub struct LpWithdrawEvent {
    pub lp_provider: Pubkey,
    pub lp_shares_burned: u64,
    pub usdc_returned: u64,
    pub new_lp_total_supply: u64,
    pub new_lp_principal: u64,
}

#[event]
pub struct LpFeeClaimedEvent {
    pub lp_owner: Pubkey,
    pub usdc_claimed: u64,
    pub fee_per_share_at_claim: u128,
}

#[event]
pub struct FundingDistributedEvent {
    pub freed_usdc: u64,
    pub fee_per_share_delta: u128,
    pub k_before: u128,
    pub k_after: u128,
    pub sol_price: u64,
    pub timestamp: i64,
}
