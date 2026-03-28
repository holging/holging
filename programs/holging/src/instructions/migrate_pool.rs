use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::SolshortError;
use crate::state::PoolState;

/// Реалоцирует on-chain аккаунт PoolState до нового размера с LP полями.
/// Использует UncheckedAccount чтобы можно было реалоцировать аккаунт,
/// который ещё не имеет LP полей (старый формат < 293 байт).
/// После realloc Anchor может десериализовать PoolState.
#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct MigratePool<'info> {
    /// CHECK: Проверяем PDA seeds и discriminator вручную.
    /// Не используем Account<PoolState> т.к. аккаунт может быть старого размера.
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

    // Проверяем discriminator (первые 8 байт)
    let disc = &data[..8];
    let expected_disc = PoolState::DISCRIMINATOR;
    require!(disc == expected_disc, SolshortError::Unauthorized);

    // Проверяем authority (байты 8..40 = первое поле Pubkey)
    let authority_bytes = &data[8..40];
    require!(
        authority_bytes == ctx.accounts.authority.key().as_ref(),
        SolshortError::Unauthorized
    );

    if current_len >= target_len {
        msg!("Account already migrated ({} >= {} bytes)", current_len, target_len);
        return Ok(());
    }

    let additional = target_len - current_len;
    msg!("Migrating pool: {} -> {} bytes (+{})", current_len, target_len, additional);

    // Нужно отпустить borrow перед realloc
    drop(data);

    // Realloc аккаунт
    pool_info.realloc(target_len, false)?;

    // Оплатить дополнительный rent
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

    // Инициализируем LP поля в безопасные значения по умолчанию
    // Десериализуем через AccountLoader-подобный подход
    let mut data = pool_info.try_borrow_mut_data()?;

    // lp_mint offset: после pending_authority (8+32+16+2+8+8+8+8+8+32+32+1+8+8+1+1+32 = 213)
    // Старые данные остаются на месте, новые байты уже обнулены realloc(zero=false),
    // но мы явно обнуляем LP поля для безопасности.
    let lp_start = current_len; // Новые данные начинаются после старых
    for byte in data[lp_start..target_len].iter_mut() {
        *byte = 0;
    }

    // min_lp_deposit — единственное поле с ненулевым дефолтом
    // Offset: 8 (disc) + 32+16+2+8+8+8+8+8+32+32+1+8+8+1+1+32 (old fields=205) + 32+8+16+8 (lp_mint+supply+accum+principal=64) = 277
    let min_deposit_offset = 8 + 205 + 64;
    if min_deposit_offset + 8 <= target_len {
        let min_deposit_bytes = MIN_LP_DEPOSIT.to_le_bytes();
        data[min_deposit_offset..min_deposit_offset + 8].copy_from_slice(&min_deposit_bytes);
    }

    msg!("Migration complete. min_lp_deposit set to {}", MIN_LP_DEPOSIT);

    Ok(())
}
