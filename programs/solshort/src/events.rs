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
pub struct TransferAuthorityEvent {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}
