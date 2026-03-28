use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::SolshortError;

/// Validated oracle price data
pub struct OraclePrice {
    /// SOL/USD price scaled to PRICE_PRECISION (1e9)
    pub price: u64,
    /// Oracle timestamp
    pub timestamp: i64,
}

/// Read and validate Pyth SOL/USD price with wide deviation (for update_price).
///
/// Performs:
/// 1. Staleness check (MAX_STALENESS_SECS)
/// 2. Confidence interval check (MAX_CONFIDENCE_PCT)
/// 3. Price deviation check vs cached price (MAX_UPDATE_PRICE_DEVIATION_BPS = 50%)
/// 4. Minimum price floor (MIN_PRICE)
pub fn get_validated_price_wide_deviation(
    price_update: &Account<PriceUpdateV2>,
    last_cached_price: u64,
) -> Result<OraclePrice> {
    get_validated_price_inner(price_update, last_cached_price, MAX_UPDATE_PRICE_DEVIATION_BPS)
}

/// Read and validate Pyth SOL/USD price.
///
/// Performs:
/// 1. Staleness check (MAX_STALENESS_SECS)
/// 2. Confidence interval check (MAX_CONFIDENCE_PCT)
/// 3. Price deviation check vs last cached price (MAX_PRICE_DEVIATION_BPS = 15%)
/// 4. Minimum price floor (MIN_PRICE)
pub fn get_validated_price(
    price_update: &Account<PriceUpdateV2>,
    last_cached_price: u64,
) -> Result<OraclePrice> {
    get_validated_price_inner(price_update, last_cached_price, MAX_PRICE_DEVIATION_BPS)
}

fn get_validated_price_inner(
    price_update: &Account<PriceUpdateV2>,
    last_cached_price: u64,
    max_deviation_bps: u64,
) -> Result<OraclePrice> {
    let clock = Clock::get()?;

    let feed_id = pyth_solana_receiver_sdk::price_update::get_feed_id_from_hex(SOL_USD_FEED_ID)
        .map_err(|_| error!(SolshortError::StaleOracle))?;

    // get_price_no_older_than checks staleness internally
    let price_data = price_update
        .get_price_no_older_than(&clock, MAX_STALENESS_SECS, &feed_id)
        .map_err(|_| error!(SolshortError::StaleOracle))?;

    // Price must be positive
    require!(price_data.price > 0, SolshortError::PriceBelowMinimum);

    let raw_price: u64 = price_data.price
        .try_into()
        .map_err(|_| error!(SolshortError::MathOverflow))?;
    let expo = price_data.exponent;

    // Convert Pyth price to PRICE_PRECISION (1e9)
    // Pyth: price=17250, expo=-2 means $172.50
    let adjusted_price: u64 = if expo >= 0 {
        raw_price
            .checked_mul(10u64.pow(expo as u32))
            .ok_or(error!(SolshortError::MathOverflow))?
            .checked_mul(PRICE_PRECISION)
            .ok_or(error!(SolshortError::MathOverflow))?
    } else {
        let divisor = 10u64.pow((-expo) as u32);
        raw_price
            .checked_mul(PRICE_PRECISION)
            .ok_or(error!(SolshortError::MathOverflow))?
            .checked_div(divisor)
            .ok_or(error!(SolshortError::MathOverflow))?
    };

    require!(adjusted_price >= MIN_PRICE, SolshortError::PriceBelowMinimum);

    // Confidence check: confidence * 100 / price < MAX_CONFIDENCE_PCT
    let raw_conf = price_data.conf;
    let adjusted_conf: u64 = if expo >= 0 {
        (raw_conf as u64)
            .checked_mul(10u64.pow(expo as u32))
            .ok_or(error!(SolshortError::MathOverflow))?
            .checked_mul(PRICE_PRECISION)
            .ok_or(error!(SolshortError::MathOverflow))?
    } else {
        let divisor = 10u64.pow((-expo) as u32);
        (raw_conf as u64)
            .checked_mul(PRICE_PRECISION)
            .ok_or(error!(SolshortError::MathOverflow))?
            .checked_div(divisor)
            .ok_or(error!(SolshortError::MathOverflow))?
    };

    let conf_pct = adjusted_conf
        .checked_mul(100)
        .ok_or(error!(SolshortError::MathOverflow))?
        .checked_div(adjusted_price)
        .ok_or(error!(SolshortError::MathOverflow))?;

    require!(
        conf_pct < MAX_CONFIDENCE_PCT,
        SolshortError::OracleConfidenceTooWide
    );

    // Price deviation check vs cached price (skip on first update)
    if max_deviation_bps > 0 && last_cached_price > 0 {
        let deviation = if adjusted_price > last_cached_price {
            adjusted_price - last_cached_price
        } else {
            last_cached_price - adjusted_price
        };
        let deviation_bps = deviation
            .checked_mul(BPS_DENOMINATOR)
            .ok_or(error!(SolshortError::MathOverflow))?
            .checked_div(last_cached_price)
            .ok_or(error!(SolshortError::MathOverflow))?;

        require!(
            deviation_bps <= max_deviation_bps,
            SolshortError::PriceDeviationTooHigh
        );
    }

    Ok(OraclePrice {
        price: adjusted_price,
        timestamp: clock.unix_timestamp,
    })
}
