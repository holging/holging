use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("BqisdDoAVUH8KH2uAspUfCYSiiAwdLvuEepk1R8A7hGn");

#[program]
pub mod faucet {
    use super::*;

    /// Admin initializes the faucet. Must be called once.
    pub fn initialize(
        ctx: Context<Initialize>,
        claim_amount: u64,
        rate_limit_secs: i64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.faucet_state;
        state.admin = ctx.accounts.admin.key();
        state.usdc_mint = ctx.accounts.usdc_mint.key();
        state.vault = ctx.accounts.vault.key();
        state.claim_amount = claim_amount;
        state.rate_limit_secs = rate_limit_secs;
        state.bump = ctx.bumps.faucet_state;
        Ok(())
    }

    /// Admin deposits USDC into the faucet vault.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.admin_ata.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    /// User claims USDC from the faucet (rate-limited on-chain).
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let record = &mut ctx.accounts.claim_record;
        let state = &ctx.accounts.faucet_state;

        // Rate limit check
        if record.last_claim_at != 0 {
            let elapsed = now.saturating_sub(record.last_claim_at);
            require!(elapsed >= state.rate_limit_secs, FaucetError::RateLimited);
        }

        // Check vault has enough
        require!(
            ctx.accounts.vault.amount >= state.claim_amount,
            FaucetError::VaultEmpty
        );

        // Transfer USDC from vault PDA to user
        let seeds = &[b"faucet".as_ref(), &[state.bump]];
        let signer = &[seeds.as_ref()];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.faucet_state.to_account_info(),
                },
                signer,
            ),
            state.claim_amount,
        )?;

        record.last_claim_at = now;
        record.bump = ctx.bumps.claim_record;

        emit!(ClaimEvent {
            user: ctx.accounts.user.key(),
            amount: state.claim_amount,
            timestamp: now,
        });

        Ok(())
    }

    /// Admin updates claim amount and rate limit.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        claim_amount: u64,
        rate_limit_secs: i64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.faucet_state;
        state.claim_amount = claim_amount;
        state.rate_limit_secs = rate_limit_secs;
        Ok(())
    }
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
pub struct FaucetState {
    pub admin: Pubkey,        // 32
    pub usdc_mint: Pubkey,    // 32
    pub vault: Pubkey,        // 32
    pub claim_amount: u64,    // 8
    pub rate_limit_secs: i64, // 8
    pub bump: u8,             // 1
}

impl FaucetState {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1;
}

#[account]
pub struct ClaimRecord {
    pub last_claim_at: i64, // 8
    pub bump: u8,           // 1
}

impl ClaimRecord {
    pub const LEN: usize = 8 + 8 + 1;
}

// ─── Contexts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = FaucetState::LEN,
        seeds = [b"faucet"],
        bump,
    )]
    pub faucet_state: Account<'info, FaucetState>,

    /// Vault ATA owned by faucet_state PDA
    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = faucet_state,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, address = faucet_state.admin)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"faucet"], bump = faucet_state.bump)]
    pub faucet_state: Account<'info, FaucetState>,

    #[account(mut, address = faucet_state.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = faucet_state.usdc_mint,
        token::authority = admin,
    )]
    pub admin_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [b"faucet"], bump = faucet_state.bump)]
    pub faucet_state: Account<'info, FaucetState>,

    #[account(mut, address = faucet_state.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        space = ClaimRecord::LEN,
        seeds = [b"claim", user.key().as_ref()],
        bump,
    )]
    pub claim_record: Account<'info, ClaimRecord>,

    #[account(
        mut,
        token::mint = faucet_state.usdc_mint,
        token::authority = user,
    )]
    pub user_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(address = faucet_state.admin)]
    pub admin: Signer<'info>,

    #[account(mut, seeds = [b"faucet"], bump = faucet_state.bump)]
    pub faucet_state: Account<'info, FaucetState>,
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ClaimEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum FaucetError {
    #[msg("Rate limited: wait before claiming again")]
    RateLimited,
    #[msg("Vault is empty, contact admin")]
    VaultEmpty,
}
