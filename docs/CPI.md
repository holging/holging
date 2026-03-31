# Holging CPI — Cross-Program Integration Guide

## Overview

The Holging program supports **Cross-Program Invocation (CPI)** — any Solana program can call Holging instructions on behalf of its own PDA. This enables composable protocols to build on top of Holging: vaults, auto-strategies, stablecoins, structured products.

**Program ID:** `CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX`

## Quick Start

### 1. Add dependency

In your program's `Cargo.toml`:

```toml
[dependencies]
holging = { path = "../holging", features = ["cpi"] }
```

Or from git:

```toml
[dependencies]
holging = { git = "https://github.com/holging/holging", features = ["cpi"] }
```

### 2. Import CPI module

```rust
use holging::cpi;
use holging::cpi::accounts::{MintShortSol, RedeemShortSol};
use holging::program::Holging;
```

### 3. Call mint via CPI

```rust
// Your program's PDA signs as the "user"
let cpi_accounts = MintShortSol {
    pool_state:      ctx.accounts.holging_pool.to_account_info(),
    vault_usdc:      ctx.accounts.holging_vault.to_account_info(),
    shortsol_mint:   ctx.accounts.shortsol_mint.to_account_info(),
    mint_authority:  ctx.accounts.mint_authority.to_account_info(),
    price_update:    ctx.accounts.price_update.to_account_info(),
    usdc_mint:       ctx.accounts.usdc_mint.to_account_info(),
    user_usdc:       ctx.accounts.pda_usdc_account.to_account_info(),
    user_shortsol:   ctx.accounts.pda_shortsol_account.to_account_info(),
    user:            ctx.accounts.your_pda.to_account_info(),
    funding_config:  Some(ctx.accounts.funding_config.to_account_info()),
    token_program:   ctx.accounts.token_program.to_account_info(),
    system_program:  ctx.accounts.system_program.to_account_info(),
};

let cpi_ctx = CpiContext::new_with_signer(
    ctx.accounts.holging_program.to_account_info(),
    cpi_accounts,
    &[your_pda_seeds],  // PDA signs as "user"
);

cpi::mint(cpi_ctx, pool_id, usdc_amount, min_tokens_out)?;
```

## Available CPI Instructions

All 20 Holging instructions are available via CPI:

### Core Trading

| Function | Description | Signer |
|---|---|---|
| `cpi::mint(ctx, pool_id, usdc_amount, min_tokens_out)` | Deposit USDC → receive shortSOL | User (or PDA) |
| `cpi::redeem(ctx, pool_id, shortsol_amount, min_usdc_out)` | Burn shortSOL → receive USDC | User (or PDA) |

### LP Operations

| Function | Description | Signer |
|---|---|---|
| `cpi::add_liquidity(ctx, pool_id, usdc_amount)` | Deposit USDC → receive LP shares | Anyone |
| `cpi::remove_liquidity(ctx, pool_id, lp_shares_amount)` | Burn LP shares → receive USDC | LP owner |
| `cpi::claim_lp_fees(ctx, pool_id)` | Claim accumulated USDC fees | LP owner |

### Funding

| Function | Description | Signer |
|---|---|---|
| `cpi::accrue_funding(ctx, pool_id)` | Apply k-decay + distribute freed USDC | Permissionless |

### Utility

| Function | Description | Signer |
|---|---|---|
| `cpi::update_price(ctx, pool_id)` | Refresh cached oracle price | Permissionless |

## Account Requirements

For CPI, your program's **PDA** acts as the `user` signer. The PDA must own:

1. **USDC token account** — for mint (source) and redeem (destination)
2. **shortSOL token account** — for mint (destination) and redeem (source)

Both accounts must have the PDA as `authority`.

### Creating Token Accounts for PDA

```rust
// Create ATA for your PDA (before first CPI call)
use anchor_spl::associated_token::AssociatedToken;

// USDC ATA for PDA
let pda_usdc_ata = get_associated_token_address(&your_pda, &usdc_mint);

// shortSOL ATA for PDA
let pda_shortsol_ata = get_associated_token_address(&your_pda, &shortsol_mint);
```

## Deriving Holging PDAs

To pass the correct accounts to CPI, derive Holging's PDAs:

```rust
use holging::constants::*;

let holging_program_id = holging::ID;

// Pool state
let (pool_pda, _) = Pubkey::find_program_address(
    &[POOL_SEED, pool_id.as_bytes()],
    &holging_program_id,
);

// USDC vault
let (vault_pda, _) = Pubkey::find_program_address(
    &[VAULT_SEED, usdc_mint.as_ref(), pool_id.as_bytes()],
    &holging_program_id,
);

// shortSOL mint
let (shortsol_mint_pda, _) = Pubkey::find_program_address(
    &[SHORTSOL_MINT_SEED, pool_id.as_bytes()],
    &holging_program_id,
);

// Mint authority
let (mint_auth_pda, _) = Pubkey::find_program_address(
    &[MINT_AUTH_SEED, pool_id.as_bytes()],
    &holging_program_id,
);

// Funding config
let (funding_pda, _) = Pubkey::find_program_address(
    &[FUNDING_SEED, pool_pda.as_ref()],
    &holging_program_id,
);
```

## Full Example: Vault Program

A vault that holds a holging portfolio (50% SOL + 50% shortSOL) via CPI:

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use holging::cpi;
use holging::cpi::accounts::MintShortSol;
use holging::program::Holging;
use holging::state::PoolState;

declare_id!("YOUR_PROGRAM_ID_HERE");

#[program]
pub mod holging_vault {
    use super::*;

    /// Deposit USDC and mint shortSOL via CPI
    pub fn deposit(ctx: Context<Deposit>, pool_id: String, usdc_amount: u64) -> Result<()> {
        // Transfer USDC from user to vault PDA first
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.vault_usdc.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            usdc_amount,
        )?;

        // Mint shortSOL via CPI — vault PDA signs as "user"
        let vault_seeds: &[&[u8]] = &[b"vault_pda", &[ctx.accounts.vault_state.bump]];

        let cpi_accounts = MintShortSol {
            pool_state:     ctx.accounts.holging_pool.to_account_info(),
            vault_usdc:     ctx.accounts.holging_vault_usdc.to_account_info(),
            shortsol_mint:  ctx.accounts.shortsol_mint.to_account_info(),
            mint_authority: ctx.accounts.holging_mint_auth.to_account_info(),
            price_update:   ctx.accounts.price_update.to_account_info(),
            usdc_mint:      ctx.accounts.usdc_mint.to_account_info(),
            user_usdc:      ctx.accounts.vault_usdc.to_account_info(),      // vault's USDC
            user_shortsol:  ctx.accounts.vault_shortsol.to_account_info(),  // vault's shortSOL
            user:           ctx.accounts.vault_pda.to_account_info(),       // PDA signs
            funding_config: Some(ctx.accounts.funding_config.to_account_info()),
            token_program:  ctx.accounts.token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.holging_program.to_account_info(),
            cpi_accounts,
            &[vault_seeds],
        );

        // min_tokens_out = 0 for simplicity (add slippage in production)
        cpi::mint(cpi_ctx, pool_id, usdc_amount, 0)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, token::authority = user)]
    pub user_usdc: Account<'info, TokenAccount>,

    /// Vault PDA — owns token accounts, signs CPI
    /// CHECK: PDA verified by seeds
    #[account(seeds = [b"vault_pda"], bump)]
    pub vault_pda: UncheckedAccount<'info>,

    #[account(mut, token::authority = vault_pda)]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(mut, token::authority = vault_pda)]
    pub vault_shortsol: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault_state: Account<'info, VaultState>,

    // Holging program accounts
    pub holging_program: Program<'info, Holging>,
    #[account(mut)]
    pub holging_pool: Account<'info, PoolState>,
    #[account(mut)]
    pub holging_vault_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub shortsol_mint: Account<'info, Mint>,
    /// CHECK: Holging mint authority PDA
    pub holging_mint_auth: UncheckedAccount<'info>,
    pub price_update: UncheckedAccount<'info>,
    pub usdc_mint: Account<'info, Mint>,
    /// CHECK: Holging funding config
    #[account(mut)]
    pub funding_config: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct VaultState {
    pub bump: u8,
}
```

## Rate Limiting

Holging enforces a **2-second cooldown** between mint/redeem operations per pool (based on `last_oracle_timestamp`). When calling via CPI, your program shares this rate limit with all other callers. Plan accordingly for high-frequency strategies.

## Error Handling

CPI errors propagate to the calling program. Handle Holging-specific errors:

```rust
match cpi::mint(cpi_ctx, pool_id, amount, min_out) {
    Ok(()) => { /* success */ },
    Err(e) => {
        // Holging errors: 6000-6020
        // 6000 = Paused, 6006 = CircuitBreaker, 6007 = RateLimitExceeded
        // 6014 = SlippageExceeded
        msg!("Holging CPI failed: {:?}", e);
        return Err(e);
    }
}
```

## Security Considerations

1. **PDA authority**: Your PDA must be the sole authority on its token accounts. Never share authority with user wallets.
2. **Slippage**: Always set `min_tokens_out` / `min_usdc_out` > 0 in production.
3. **Funding config**: Always pass `funding_config` to ensure k is up-to-date.
4. **Reentrancy**: Solana prevents reentrancy natively — your program cannot be re-entered via Holging CPI.
5. **Account validation**: Holging validates all accounts internally (PDA seeds, ownership). Your program should still verify the `holging_program` ID matches the expected program.

## Testing CPI

```typescript
// In anchor tests, use program.methods as usual
// CPI is transparent — the calling program handles it internally

const tx = await yourProgram.methods
    .deposit(poolId, new BN(100_000_000))  // 100 USDC
    .accounts({
        user: wallet.publicKey,
        userUsdc: userUsdcAta,
        vaultPda: vaultPda,
        // ... all accounts
        holgingProgram: HOLGING_PROGRAM_ID,
    })
    .rpc();
```

## Links

- [Program source](https://github.com/holging/holging/tree/main/programs/holging)
- [IDL (JSON)](https://github.com/holging/holging/blob/main/target/idl/holging.json)
- [Constants](https://github.com/holging/holging/blob/main/programs/holging/src/constants.rs)
- [State types](https://github.com/holging/holging/blob/main/programs/holging/src/state.rs)
