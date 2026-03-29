use anchor_lang::prelude::*;

#[error_code]
pub enum SolshortError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Oracle price is stale")]
    StaleOracle,
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,
    #[msg("Price deviation exceeds maximum")]
    PriceDeviationTooHigh,
    #[msg("Insufficient liquidity in vault")]
    InsufficientLiquidity,
    #[msg("Amount too small")]
    AmountTooSmall,
    #[msg("Circuit breaker triggered")]
    CircuitBreaker,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Price below minimum")]
    PriceBelowMinimum,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid fee")]
    InvalidFee,
    #[msg("Cannot update k with tokens in circulation")]
    CirculatingNotZero,
    #[msg("Pool ID too long (max 32 bytes)")]
    InvalidPoolId,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("No pending authority — call transfer_authority first")]
    NoPendingAuthority,
    #[msg("Deposit below minimum LP amount")]
    BelowMinLpDeposit,
    #[msg("LP system not initialized — call initialize_lp first")]
    LpNotInitialized,
    #[msg("FundingConfig exists but was not passed — pass funding_config account")]
    FundingConfigRequired,
    #[msg("No fees to claim")]
    NoFeesToClaim,
    #[msg("Insufficient LP shares")]
    InsufficientLpShares,
}
