use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::state::PoolState;

/// Миграция PoolState: переставляет поля в правильный порядок.
/// Layout v1 (после LP миграции, без pyth_feed_id):
///   [0..213] old fields | [213..293] LP fields (80 bytes)
/// Layout v2 (после pyth_feed_id добавления, неправильный порядок):
///   [0..213] old fields | [213..293] LP fields | [293..357] pyth_feed_id (64 bytes)
/// Layout v3 (правильный, как в PoolState struct):
///   [0..213] old fields | [213..277] pyth_feed_id | [277..357] LP fields
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct MigratePool<'info> {
    /// CHECK: Проверяем PDA seeds и discriminator вручную.
    #[account(
        mut,
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump,
    )]
    pub pool_state: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigratePool>, _pool_id: String) -> Result<()> {
    let pool_info = &ctx.accounts.pool_state;
    let data = pool_info.try_borrow_data()?;
    let current_len = data.len();
    let target_len = 8 + PoolState::INIT_SPACE;

    // Проверяем discriminator
    let disc = &data[..8];
    let expected_disc = PoolState::DISCRIMINATOR;
    require!(disc == expected_disc, SolshortError::Unauthorized);

    // Проверяем authority
    let authority_bytes = &data[8..40];
    require!(
        authority_bytes == ctx.accounts.authority.key().as_ref(),
        SolshortError::Unauthorized
    );

    drop(data);

    // Step 1: Realloc if needed
    if current_len < target_len {
        let additional = target_len - current_len;
        msg!("Reallocating pool: {} -> {} bytes (+{})", current_len, target_len, additional);

        pool_info.realloc(target_len, false)?;

        let rent = Rent::get()?;
        let new_min_balance = rent.minimum_balance(target_len);
        let current_balance = pool_info.lamports();
        if current_balance < new_min_balance {
            let diff = new_min_balance - current_balance;
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.authority.to_account_info(),
                        to: pool_info.to_account_info(),
                    },
                ),
                diff,
            )?;
        }
    }

    // Step 2: Fix layout — swap LP fields and pyth_feed_id to correct positions
    let mut data = pool_info.try_borrow_mut_data()?;

    // OLD_FIELDS_END = 8 (disc) + 205 (fields through pending_authority) = 213
    let old_fields_end: usize = 213;
    // LP fields size: lp_mint(32) + lp_total_supply(8) + fee_per_share_accumulated(16)
    //                + lp_principal(8) + min_lp_deposit(8) + total_lp_fees_pending(8) = 80
    let lp_size: usize = 80;
    // pyth_feed_id size: 64
    let feed_size: usize = 64;

    // Check if feed_id is at wrong position (293) — v2 layout
    let feed_at_293 = &data[old_fields_end + lp_size..old_fields_end + lp_size + feed_size];
    let feed_hex = core::str::from_utf8(feed_at_293).unwrap_or("");
    let is_v2_layout = feed_hex.len() == 64 && feed_hex.chars().all(|c| c.is_ascii_hexdigit());

    if is_v2_layout {
        msg!("Fixing v2 layout: moving pyth_feed_id from offset {} to {}", old_fields_end + lp_size, old_fields_end);
        // Copy LP fields and feed_id to temp buffers
        let mut lp_buf = [0u8; 80];
        let mut feed_buf = [0u8; 64];
        lp_buf.copy_from_slice(&data[old_fields_end..old_fields_end + lp_size]);
        feed_buf.copy_from_slice(&data[old_fields_end + lp_size..old_fields_end + lp_size + feed_size]);

        // Write in correct order: feed_id first, then LP fields
        data[old_fields_end..old_fields_end + feed_size].copy_from_slice(&feed_buf);
        data[old_fields_end + feed_size..old_fields_end + feed_size + lp_size].copy_from_slice(&lp_buf);
        msg!("Layout fixed: pyth_feed_id at {}, LP fields at {}", old_fields_end, old_fields_end + feed_size);
    } else {
        // Check if feed_id is already at correct position (213) — v3 layout
        let feed_at_213 = &data[old_fields_end..old_fields_end + feed_size];
        let feed_hex_213 = core::str::from_utf8(feed_at_213).unwrap_or("");
        let is_v3 = feed_hex_213.len() == 64 && feed_hex_213.chars().all(|c| c.is_ascii_hexdigit());

        if is_v3 {
            msg!("Layout already correct (v3)");
        } else {
            // Fresh migration — write defaults
            msg!("Fresh migration: writing default values");
            // Zero out new area
            for byte in data[old_fields_end..target_len].iter_mut() {
                *byte = 0;
            }
            // Write SOL/USD feed_id at correct position
            let feed_bytes = SOL_USD_FEED_ID.as_bytes();
            data[old_fields_end..old_fields_end + feed_size].copy_from_slice(feed_bytes);
            // Write min_lp_deposit at correct position
            // min_lp_deposit offset = old_fields_end + feed_size + 32 + 8 + 16 + 8 = +64+64 = +128
            let min_deposit_offset = old_fields_end + feed_size + 32 + 8 + 16 + 8;
            if min_deposit_offset + 8 <= target_len {
                data[min_deposit_offset..min_deposit_offset + 8]
                    .copy_from_slice(&MIN_LP_DEPOSIT.to_le_bytes());
            }
        }
    }

    msg!("Migration complete");
    Ok(())
}
