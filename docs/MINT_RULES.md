# Mint — Token Minting Rules

> Complete description of the inverse token creation process in the Holging protocol.

---

## Overview

Mint — a USDC deposit operation to receive an inverse token (shortSOL, shortTSLA, etc.).

```
User → USDC → Protocol → inverse token
```

**Key principle:** tokens are minted ONLY by the program, using a formula, based on the Pyth oracle price. Nobody — neither the admin nor the user — can create tokens without USDC collateral in the vault.

---

## Mint Formula

```
1. shortsol_price = k × 1e9 / SOL_price

2. dynamic_fee = calc_dynamic_fee(base_fee, vault, circulating, k, price)

3. fee_amount = usdc_amount × dynamic_fee / 10000

4. effective_usdc = usdc_amount − fee_amount

5. tokens = effective_usdc × 1000 × 1e9 / shortsol_price
            ↑ scaling 1e6→1e9   ↑ PRICE_PRECISION
```

### Example

```
Input:        100 USDC
SOL price:    $84.57
k:            7,197,715,091,917
shortSOL:     $85.11 (= k × 1e9 / 84,570,000,000)
Coverage:     6,446% (> 200%)
Dynamic fee:  20 bps (0.20%)

Fee:          100 × 20 / 10000 = $0.20
Effective:    $99.98
Tokens:       99.98 × 1000 × 1e9 / 85,110,000,000 = 1.1748 shortSOL

Output:       1.1748 shortSOL → user's wallet
Vault:        +$100 USDC
```

---

## Step-by-Step Process (on-chain)

### 1. Pre-Mint Checks

| Check | Condition | Error |
|-------|-----------|-------|
| Pool is not paused | `!pool.paused` | `Paused` |
| Amount > 0 | `usdc_amount > 0` | `AmountTooSmall` |
| Rate limit | `>= 2 seconds since last operation` | `RateLimitExceeded` |
| Funding config | If exists — must be provided | `FundingConfigRequired` |

### 2. Funding (if FundingConfig is provided)

```
Before price calculation, k-decay is applied:
  elapsed = now − last_accrued
  periods = elapsed / 86400  (number of days elapsed)
  k_new = k × (1 − rate_bps/10000)^periods

Funding decreases k → shortSOL becomes cheaper over time.
Current rate: 10 bps/day = 0.1%/day ≈ 30.6%/year
```

### 3. Oracle Validation (4 levels)

| Level | Parameter | Value (devnet) | Description |
|-------|-----------|----------------|-------------|
| 1 | Staleness | 259,200 sec (3 days) | Pyth price no older than N seconds |
| 2 | Confidence | < 2% | Pyth confidence interval |
| 3 | Deviation | < 15% (1500 bps) | Deviation from cached price |
| 4 | Floor | > $1.00 | Minimum asset price |

If any check fails → `StaleOracle`, `PriceBelowMinimum`, or `PriceDeviationTooLarge`.

### 4. Dynamic Fee Calculation

| Vault Coverage | Fee | In bps | Description |
|---------------|-----|--------|-------------|
| > 200% | base×5 | 20 bps | Vault is healthy |
| 150–200% | base×10 | 40 bps | Normal |
| 100–150% | base×15 | 60 bps | Elevated |
| < 100% | base×20 | 80 bps | Critical |

Maximum: 100 bps (1%). Minimum: 1 bps.

### 5. Transfer USDC → Vault

```
CPI: TokenProgram.Transfer
  from: user_usdc (ATA)
  to:   vault_usdc (PDA)
  amount: usdc_amount (full amount, fee stays in vault)
```

### 6. Mint tokens → User

```
CPI: TokenProgram.MintTo
  mint:      shortsol_mint (PDA)
  to:        user_shortsol (ATA)
  authority: mint_authority (PDA, signed by the program)
  amount:    tokens (calculated in step 4)
```

### 7. Vault Reconciliation

```
vault_usdc.reload()  // Re-read the actual balance from chain
require!(vault_usdc.amount >= expected)  // Verify CPI didn't cheat
```

If the actual vault balance is less than expected → `InsufficientLiquidity`.

### 8. Pool State Update

```
pool.circulating   += tokens
pool.total_minted  += tokens
pool.vault_balance  = expected_vault (reconciled)
pool.total_fees    += fee_amount
pool.last_oracle_price     = sol_price
pool.last_oracle_timestamp = oracle.timestamp
```

### 9. Fee Distribution (LP)

```
If LP total supply > 0:
  fee_per_share += fee_amount × 1e12 / lp_total_supply
  total_lp_fees_pending += fee_amount

Fees are distributed proportionally to LP shares.
```

### 10. Event Emission

```rust
MintEvent {
    user:           wallet pubkey
    usdc_in:        100_000_000 (100 USDC)
    tokens_out:     1_174_800_000 (1.1748 shortSOL)
    sol_price:      84_570_000_000 ($84.57)
    shortsol_price: 85_110_000_000 ($85.11)
    fee:            200_000 ($0.20)
    timestamp:      1774870000
}
```

---

## Slippage Protection

The user passes `min_tokens_out` — the minimum number of tokens. If the calculated amount < min → the transaction reverts with `SlippageExceeded`.

```
Frontend: min_tokens_out = expected × (1 − slippage_bps / 10000)
Default slippage: 1% (100 bps)
MCP Server: 2% (200 bps)
```

---

## Transaction Accounts

| # | Account | Type | Description |
|---|---------|------|-------------|
| 1 | `pool_state` | PDA, mut | Pool state |
| 2 | `vault_usdc` | PDA, mut | USDC vault |
| 3 | `shortsol_mint` | PDA, mut | Inverse token mint |
| 4 | `mint_authority` | PDA | Signer for MintTo |
| 5 | `price_update` | Account | Pyth PriceUpdateV2 |
| 6 | `usdc_mint` | Account | USDC mint |
| 7 | `user_usdc` | ATA, mut | User's USDC |
| 8 | `user_shortsol` | ATA, mut | User's inverse token |
| 9 | `user` | Signer, mut | User's wallet |
| 10 | `funding_config` | PDA, mut, optional | Funding configuration |
| 11 | `token_program` | Program | SPL Token |
| 12 | `system_program` | Program | System |

---

## Constraints

| Constraint | Value | Reason |
|------------|-------|--------|
| Min amount | > 0 USDC | Protection against empty transactions |
| Rate limit | 2 sec between operations | Anti-sandwich |
| Max fee | 1% (100 bps) | Caps in calc_dynamic_fee |
| Oracle staleness | 259,200 sec (devnet) | Stock feeds on weekends |
| Oracle deviation | 15% from cache | Protection against manipulation |
| Oracle confidence | < 2% | Pyth confidence check |
| Price floor | > $1.00 | Protection against extreme crash |
| Funding required | If FundingConfig exists | MEDIUM-02 fix |

---

## Error Codes (Mint)

| Code | Hex | Name | Description |
|------|-----|------|-------------|
| 6000 | 0x1770 | Paused | Pool is paused |
| 6001 | 0x1771 | StaleOracle | Price is stale or feed_id is invalid |
| 6002 | 0x1772 | PriceBelowMinimum | SOL < $1.00 |
| 6003 | 0x1773 | PriceDeviationTooLarge | Deviation > 15% |
| 6004 | 0x1774 | InsufficientLiquidity | Vault reconciliation failed |
| 6005 | 0x1775 | AmountTooSmall | amount = 0 |
| 6006 | 0x1776 | MathOverflow | Arithmetic overflow |
| 6007 | 0x1777 | SlippageExceeded | tokens < min_tokens_out |
| 6010 | 0x177A | RateLimitExceeded | < 2 sec since previous operation |
| 6018 | 0x1782 | FundingConfigRequired | FundingConfig not provided |

---

## Calling via MCP

```
# Simulation (no transaction)
→ simulate_mint { "usdc_amount": 100, "pool_id": "sol" }
← { "expectedOutput": "1.1748 shortSOL", "fee": "$0.02", "feePercent": "0.02%" }

# Execution
→ mint { "usdc_amount": 100, "pool_id": "sol" }
← { "success": true, "signature": "3tAM59...", "explorer": "https://..." }
```

---

## Calling via Frontend

```typescript
const { mint } = useSolshort("sol");
await mint(
  new BN(100_000_000),           // 100 USDC
  new PublicKey("CAMk3...heeGn") // USDC mint
);
```

The frontend automatically:
1. Posts the Pyth price update (PythSolanaReceiver SDK)
2. Creates the ATA if needed
3. Calculates slippage protection (1%)
4. Sends updatePrice + mint in a single transaction

---

*Mint is the only way to create inverse tokens. Every token is backed by USDC in the vault.*
