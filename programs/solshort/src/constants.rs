/// Internal price precision (1e9) for fixed-point arithmetic
pub const PRICE_PRECISION: u64 = 1_000_000_000;

/// USDC has 6 decimals
pub const USDC_DECIMALS: u8 = 6;

/// shortSOL token has 9 decimals (matching SOL)
pub const SHORTSOL_DECIMALS: u8 = 9;

/// Default fee: 4 basis points = 0.04%
pub const DEFAULT_FEE_BPS: u16 = 4;

/// Maximum oracle price staleness in seconds
pub const MAX_STALENESS_SECS: u64 = 30;

/// Maximum confidence interval as percentage of price (2%)
pub const MAX_CONFIDENCE_PCT: u64 = 2;

/// Minimum vault ratio in basis points (95% = 9500 bps)
pub const MIN_VAULT_RATIO_BPS: u64 = 9500;

/// Maximum price deviation vs cached price (15% = 1500 bps)
pub const MAX_PRICE_DEVIATION_BPS: u64 = 1500;

/// Minimum SOL price in PRICE_PRECISION units ($1.00)
pub const MIN_PRICE: u64 = 1_000_000_000;

/// BPS denominator
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Pyth SOL/USD feed ID (hex) — works on devnet and mainnet
pub const SOL_USD_FEED_ID: &str =
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

/// PDA seeds
pub const POOL_SEED: &[u8] = b"pool";
pub const VAULT_SEED: &[u8] = b"vault";
pub const MINT_AUTH_SEED: &[u8] = b"mint_auth";
pub const SHORTSOL_MINT_SEED: &[u8] = b"shortsol_mint";
