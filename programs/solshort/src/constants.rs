/// Internal price precision (1e9) for fixed-point arithmetic
pub const PRICE_PRECISION: u64 = 1_000_000_000;

/// Seconds in a day
pub const SECS_PER_DAY: u64 = 86_400;

/// Max funding rate: 100 bps/day = 1%/day ≈ 97% compound/year
/// При 10 bps/день: ~0.1%/день → ~30.6% compound/year (не 3.7%)
pub const MAX_FUNDING_RATE_BPS: u16 = 100;

/// Максимальный elapsed за один вызов accrue_funding (30 дней).
/// Защищает от обнуления k при длительном простое keeper'а.
/// Если elapsed > 30 дней — остаток переносится на следующий вызов.
pub const MAX_FUNDING_ELAPSED_SECS: u64 = SECS_PER_DAY * 30;

/// Минимальный vault после вывода ликвидности или фис (110% обязательств).
/// Даёт 15% буфер выше circuit breaker (MIN_VAULT_RATIO_BPS = 95%).
pub const MIN_VAULT_POST_WITHDRAWAL_BPS: u64 = 11_000;

/// PDA seed for FundingConfig
pub const FUNDING_SEED: &[u8] = b"funding";

/// USDC has 6 decimals
pub const USDC_DECIMALS: u8 = 6;

/// shortSOL token has 9 decimals (matching SOL)
pub const SHORTSOL_DECIMALS: u8 = 9;

/// Default fee: 4 basis points = 0.04% per side (0.08% roundtrip)
pub const DEFAULT_FEE_BPS: u16 = 4;

/// Maximum oracle price staleness in seconds (120s for devnet, tighten for mainnet)
pub const MAX_STALENESS_SECS: u64 = 120;

/// Maximum confidence interval as percentage of price (2%)
pub const MAX_CONFIDENCE_PCT: u64 = 2;

/// Minimum vault ratio in basis points (95% = 9500 bps)
pub const MIN_VAULT_RATIO_BPS: u64 = 9500;

/// Maximum price deviation vs cached price for mint/redeem (15% = 1500 bps)
pub const MAX_PRICE_DEVIATION_BPS: u64 = 1500;

/// Maximum price deviation for update_price (50% = 5000 bps, wider to allow cache refresh)
pub const MAX_UPDATE_PRICE_DEVIATION_BPS: u64 = 5000;

/// Minimum SOL price in PRICE_PRECISION units ($1.00)
pub const MIN_PRICE: u64 = 1_000_000_000;

/// BPS denominator
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Pyth SOL/USD feed ID (hex) — works on devnet and mainnet
pub const SOL_USD_FEED_ID: &str =
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

/// Maximum pool_id length in bytes
pub const MAX_POOL_ID_LEN: usize = 32;

/// Minimum seconds between mint/redeem operations (rate limit)
pub const MIN_ACTION_INTERVAL_SECS: i64 = 2;

/// PDA seeds
pub const POOL_SEED: &[u8] = b"pool";
pub const VAULT_SEED: &[u8] = b"vault";
pub const MINT_AUTH_SEED: &[u8] = b"mint_auth";
pub const SHORTSOL_MINT_SEED: &[u8] = b"shortsol_mint";
pub const LP_MINT_SEED: &[u8] = b"lp_mint";
pub const LP_POSITION_SEED: &[u8] = b"lp_position";

/// LP token decimals (matches USDC for easy share calculation)
pub const LP_TOKEN_DECIMALS: u8 = 6;

/// Fee accumulator precision multiplier (1e12) — prevents dust loss in per-share math
pub const SHARE_PRECISION: u128 = 1_000_000_000_000;

/// Minimum LP deposit in USDC base units ($100 = 100 × 10^6)
pub const MIN_LP_DEPOSIT: u64 = 100_000_000;
