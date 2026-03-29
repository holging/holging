/// Internal price precision (1e9) for fixed-point arithmetic
pub const PRICE_PRECISION: u64 = 1_000_000_000;

/// Seconds in a day
pub const SECS_PER_DAY: u64 = 86_400;

/// Max funding rate: 100 bps/day = 1%/day ≈ 97% compound/year
/// При 10 bps/день: ~0.1%/день → ~30.6% compound/year (не 3.7%)
pub const MAX_FUNDING_RATE_BPS: u16 = 100;

/// Minimum k value — prevents decay to zero from extended keeper downtime (MEDIUM-03).
/// Set to 1e6 (equivalent to shortSOL_price = 1e6 * 1e9 / SOL_price = ~$0.007 at $150 SOL).
/// This is a safety floor — k should never approach this in normal operation.
pub const MIN_K: u128 = 1_000_000;

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

/// USDC Mint address on Solana mainnet.
/// On devnet, validation is skipped — any 6-decimal mint is accepted for testing.
#[cfg(not(feature = "devnet"))]
use solana_program::pubkey;

#[cfg(not(feature = "devnet"))]
pub const USDC_MINT_PUBKEY: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/// Maximum oracle price staleness in seconds
/// 86400s on devnet (stock feeds only update during US market hours)
/// Tighten to 30s for mainnet SOL pools
#[cfg(feature = "devnet")]
pub const MAX_STALENESS_SECS: u64 = 86400;

#[cfg(not(feature = "devnet"))]
pub const MAX_STALENESS_SECS: u64 = 30;

/// Maximum confidence interval as percentage of price (2%)
pub const MAX_CONFIDENCE_PCT: u64 = 2;

/// Minimum vault ratio in basis points (95% = 9500 bps)
pub const MIN_VAULT_RATIO_BPS: u64 = 9500;

/// Maximum price deviation vs cached price for mint/redeem (15% = 1500 bps)
pub const MAX_PRICE_DEVIATION_BPS: u64 = 1500;

/// Maximum price deviation for update_price (15% = 1500 bps, matching mint/redeem).
/// Previously was 5000 (50%) which created a two-step price walk attack vector
/// where update_price(50%) + mint(15%) = 57.5% compound deviation.
/// Now aligned with mint/redeem to prevent oracle deviation walk (HIGH-01).
pub const MAX_UPDATE_PRICE_DEVIATION_BPS: u64 = 1500;

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

/// Virtual shares offset for dead shares pattern (ERC-4626 defense-in-depth).
/// Prevents first-depositor share inflation attack (HIGH-02).
pub const VIRTUAL_SHARES: u64 = 1_000;

/// Virtual assets offset matching VIRTUAL_SHARES (0.001 USDC in 1e6 base units).
pub const VIRTUAL_ASSETS: u64 = 1_000;

/// Minimum LP deposit in USDC base units ($100 = 100 × 10^6)
pub const MIN_LP_DEPOSIT: u64 = 100_000_000;
