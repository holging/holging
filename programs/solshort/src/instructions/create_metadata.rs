use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::prelude::borsh::BorshSerialize;

use crate::constants::*;
use crate::state::PoolState;

/// Metaplex Token Metadata program ID
const TOKEN_METADATA_PROGRAM_ID: Pubkey =
    pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/// CreateMetadataAccountV3 discriminator (instruction index 33)
const CREATE_METADATA_V3_DISCRIMINATOR: u8 = 33;

/// Borsh-serializable DataV2 for Metaplex
#[derive(BorshSerialize)]
struct DataV2 {
    name: String,
    symbol: String,
    uri: String,
    seller_fee_basis_points: u16,
    creators: Option<Vec<u8>>, // None
    collection: Option<Vec<u8>>, // None
    uses: Option<Vec<u8>>, // None
}

/// Borsh-serializable args for CreateMetadataAccountV3
#[derive(BorshSerialize)]
struct CreateMetadataAccountArgsV3 {
    data: DataV2,
    is_mutable: bool,
    collection_details: Option<Vec<u8>>, // None
}

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct CreateTokenMetadata<'info> {
    #[account(
        seeds = [POOL_SEED, pool_id.as_bytes()],
        bump = pool_state.bump,
        has_one = authority,
    )]
    pub pool_state: Account<'info, PoolState>,

    /// CHECK: shortSOL mint PDA
    #[account(
        seeds = [SHORTSOL_MINT_SEED, pool_id.as_bytes()],
        bump,
    )]
    pub shortsol_mint: UncheckedAccount<'info>,

    /// CHECK: mint authority PDA — signs CPI
    #[account(
        seeds = [MINT_AUTH_SEED, pool_id.as_bytes()],
        bump = pool_state.mint_auth_bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    /// CHECK: metadata PDA derived by Metaplex
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Token Metadata program
    #[account(address = TOKEN_METADATA_PROGRAM_ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateTokenMetadata>,
    pool_id: String,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let pool_id_bytes = pool_id.as_bytes();
    let mint_auth_bump = ctx.accounts.pool_state.mint_auth_bump;
    let signer_seeds: &[&[u8]] = &[MINT_AUTH_SEED, pool_id_bytes, &[mint_auth_bump]];

    let args = CreateMetadataAccountArgsV3 {
        data: DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        is_mutable: false,
        collection_details: None,
    };

    let mut data = vec![CREATE_METADATA_V3_DISCRIMINATOR];
    args.serialize(&mut data).map_err(|_| ProgramError::InvalidInstructionData)?;

    let accounts = vec![
        AccountMeta::new(ctx.accounts.metadata.key(), false),
        AccountMeta::new_readonly(ctx.accounts.shortsol_mint.key(), false),
        AccountMeta::new_readonly(ctx.accounts.mint_authority.key(), true),
        AccountMeta::new(ctx.accounts.authority.key(), true),
        AccountMeta::new_readonly(ctx.accounts.mint_authority.key(), false),
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.rent.key(), false),
    ];

    let ix = Instruction {
        program_id: TOKEN_METADATA_PROGRAM_ID,
        accounts,
        data,
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.metadata.to_account_info(),
            ctx.accounts.shortsol_mint.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    Ok(())
}
