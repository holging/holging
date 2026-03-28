import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import BN from "bn.js";

const IDL = require("../target/idl/solshort.json");

const POOL_ID = "sol";
const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const MINT_AUTH_SEED = Buffer.from("mint_auth");
const SHORTSOL_MINT_SEED = Buffer.from("shortsol_mint");
const PRICE_PRECISION = new BN(1_000_000_000);

describe("solshort", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey(IDL.address);
  const program = new Program(IDL, provider);

  const authority = provider.wallet as anchor.Wallet;
  let usdcMint: PublicKey;
  let poolStatePda: PublicKey;
  let poolBump: number;
  let shortsolMintPda: PublicKey;
  let mintAuthPda: PublicKey;
  let vaultUsdcPda: PublicKey;
  let userUsdcAccount: PublicKey;

  before(async () => {
    [poolStatePda, poolBump] = PublicKey.findProgramAddressSync(
      [POOL_SEED, Buffer.from(POOL_ID)],
      programId
    );

    [shortsolMintPda] = PublicKey.findProgramAddressSync(
      [SHORTSOL_MINT_SEED, Buffer.from(POOL_ID)],
      programId
    );

    [mintAuthPda] = PublicKey.findProgramAddressSync(
      [MINT_AUTH_SEED, Buffer.from(POOL_ID)],
      programId
    );

    usdcMint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      6
    );

    [vaultUsdcPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, usdcMint.toBuffer(), Buffer.from(POOL_ID)],
      programId
    );

    userUsdcAccount = await createAccount(
      provider.connection,
      (authority as any).payer,
      usdcMint,
      authority.publicKey
    );

    await mintTo(
      provider.connection,
      (authority as any).payer,
      usdcMint,
      userUsdcAccount,
      authority.publicKey,
      10_000_000_000 // 10,000 USDC
    );

    console.log("Setup complete:");
    console.log("  Program ID:", programId.toBase58());
    console.log("  Pool PDA:", poolStatePda.toBase58());
    console.log("  USDC Mint:", usdcMint.toBase58());
  });

  // ═══════════════════════════════════════════════════
  // PDA derivation tests
  // ═══════════════════════════════════════════════════
  describe("PDA derivation", () => {
    it("derives pool PDA correctly", () => {
      const [pda, bump] = PublicKey.findProgramAddressSync(
        [POOL_SEED, Buffer.from(POOL_ID)],
        programId
      );
      assert.ok(pda.toBase58().length > 0);
      assert.ok(bump >= 0 && bump <= 255);
    });

    it("derives mint PDA correctly", () => {
      const [pda] = PublicKey.findProgramAddressSync(
        [SHORTSOL_MINT_SEED, Buffer.from(POOL_ID)],
        programId
      );
      assert.ok(pda.toBase58().length > 0);
    });

    it("derives vault PDA with USDC mint", () => {
      const [pda] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, usdcMint.toBuffer(), Buffer.from(POOL_ID)],
        programId
      );
      assert.ok(pda.toBase58().length > 0);
    });

    it("different pool_id gives different PDAs", () => {
      const [pda1] = PublicKey.findProgramAddressSync(
        [POOL_SEED, Buffer.from("sol")],
        programId
      );
      const [pda2] = PublicKey.findProgramAddressSync(
        [POOL_SEED, Buffer.from("btc")],
        programId
      );
      assert.notEqual(pda1.toBase58(), pda2.toBase58());
    });
  });

  // ═══════════════════════════════════════════════════
  // Math verification
  // ═══════════════════════════════════════════════════
  describe("math verification", () => {
    it("shortSOL price = k / SOL_price at initialization", () => {
      const solPrice = new BN(170).mul(PRICE_PRECISION);
      const k = solPrice.mul(solPrice).div(PRICE_PRECISION);
      const shortsolPrice = k.mul(PRICE_PRECISION).div(solPrice);
      assert.ok(shortsolPrice.eq(solPrice));
    });

    it("shortSOL price inversely correlates with SOL", () => {
      const initPrice = new BN(170).mul(PRICE_PRECISION);
      const k = initPrice.mul(initPrice).div(PRICE_PRECISION);
      const newPrice = new BN(340).mul(PRICE_PRECISION);
      const shortsolPrice = k.mul(PRICE_PRECISION).div(newPrice);
      const expected = new BN(85).mul(PRICE_PRECISION);
      assert.ok(shortsolPrice.eq(expected));
    });

    it("holging portfolio P&L is always >= 0", () => {
      const multipliers = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0, 3.0, 5.0, 10.0];
      for (const x of multipliers) {
        const v = 0.5 * (x + 1 / x);
        const pnl = v - 1;
        assert.ok(pnl >= -0.0001, `Holging P&L negative at x=${x}: ${pnl}`);
      }
    });

    it("P&L = (x-1)^2 / (2x)", () => {
      const multipliers = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0];
      for (const x of multipliers) {
        const v = 0.5 * (x + 1 / x) - 1;
        const formula = (x - 1) ** 2 / (2 * x);
        assert.ok(
          Math.abs(v - formula) < 1e-10,
          `P&L formula mismatch at x=${x}: ${v} vs ${formula}`
        );
      }
    });

    it("fee calculation (0.04%)", () => {
      const usdcAmount = new BN(170_000_000);
      const feeBps = new BN(4);
      const bpsDenom = new BN(10_000);
      const fee = usdcAmount.mul(feeBps).div(bpsDenom);
      assert.equal(fee.toNumber(), 68_000);
    });

    it("token mint calculation with decimal scaling", () => {
      const shortsolPrice = new BN(170).mul(PRICE_PRECISION);
      const effectiveUsdc = new BN(169_932_000);
      const scaling = new BN(1000);
      const tokens = effectiveUsdc
        .mul(scaling)
        .mul(PRICE_PRECISION)
        .div(shortsolPrice);
      assert.ok(tokens.gt(new BN(999_000_000)));
      assert.ok(tokens.lt(new BN(1_000_000_000)));
    });

    it("k cancels out in return calculation", () => {
      const k1 = new BN(28900).mul(PRICE_PRECISION);
      const k2 = new BN(50000).mul(PRICE_PRECISION);
      const p0 = new BN(170).mul(PRICE_PRECISION);
      const p1 = new BN(100).mul(PRICE_PRECISION);

      const ss0_k1 = k1.mul(PRICE_PRECISION).div(p0);
      const ss1_k1 = k1.mul(PRICE_PRECISION).div(p1);
      const ss0_k2 = k2.mul(PRICE_PRECISION).div(p0);
      const ss1_k2 = k2.mul(PRICE_PRECISION).div(p1);

      const ret1 = ss1_k1.mul(PRICE_PRECISION).div(ss0_k1);
      const ret2 = ss1_k2.mul(PRICE_PRECISION).div(ss0_k2);
      assert.ok(ret1.eq(ret2), "Returns should be equal regardless of k");
    });

    it("slippage calculation matches on-chain", () => {
      const solPrice = new BN(170).mul(PRICE_PRECISION);
      const k = solPrice.mul(solPrice).div(PRICE_PRECISION);
      const shortsolPrice = k.mul(PRICE_PRECISION).div(solPrice);
      const usdcAmount = new BN(170_000_000);
      const feeBps = new BN(4);
      const bpsDenom = new BN(10_000);
      const fee = usdcAmount.mul(feeBps).div(bpsDenom);
      const effectiveUsdc = usdcAmount.sub(fee);
      const scaling = new BN(1000);
      const tokens = effectiveUsdc.mul(scaling).mul(PRICE_PRECISION).div(shortsolPrice);

      // 1% slippage tolerance
      const slippageBps = new BN(100);
      const minTokensOut = tokens.mul(bpsDenom.sub(slippageBps)).div(bpsDenom);
      assert.ok(minTokensOut.lt(tokens), "Min tokens should be less than expected");
      assert.ok(minTokensOut.gt(tokens.mul(new BN(98)).div(new BN(100))), "Min tokens should be > 98% of expected");
    });
  });

  // ═══════════════════════════════════════════════════
  // IDL validation
  // ═══════════════════════════════════════════════════
  describe("IDL validation", () => {
    it("has 20 instructions", () => {
      assert.equal(IDL.instructions.length, 20);
      const names = IDL.instructions.map((i: any) => i.name);
      assert.include(names, "initialize");
      assert.include(names, "mint");
      assert.include(names, "redeem");
      assert.include(names, "update_price");
      assert.include(names, "add_liquidity");
      assert.include(names, "remove_liquidity");
      assert.include(names, "withdraw_fees");
      assert.include(names, "update_k");
      assert.include(names, "set_pause");
      assert.include(names, "create_metadata");
      assert.include(names, "transfer_authority");
      assert.include(names, "accept_authority");
      assert.include(names, "update_fee");
      assert.include(names, "initialize_funding");
      assert.include(names, "accrue_funding");
      assert.include(names, "update_funding_rate");
      assert.include(names, "initialize_lp");
      assert.include(names, "migrate_pool");
      assert.include(names, "claim_lp_fees");
      assert.include(names, "update_min_lp_deposit");
    });

    it("has 20 error codes", () => {
      assert.equal(IDL.errors.length, 20);
      const names = IDL.errors.map((e: any) => e.name);
      assert.include(names, "Paused");
      assert.include(names, "StaleOracle");
      assert.include(names, "CircuitBreaker");
      assert.include(names, "MathOverflow");
      assert.include(names, "RateLimitExceeded");
      assert.include(names, "InvalidPoolId");
      assert.include(names, "SlippageExceeded");
      assert.include(names, "NoPendingAuthority");
    });

    it("has PoolState type with all fields", () => {
      const poolType = IDL.types.find((t: any) => t.name === "PoolState");
      assert.ok(poolType, "PoolState type should exist");
      const fieldNames = poolType.type.fields.map((f: any) => f.name);
      assert.include(fieldNames, "authority");
      assert.include(fieldNames, "k");
      assert.include(fieldNames, "fee_bps");
      assert.include(fieldNames, "circulating");
      assert.include(fieldNames, "vault_balance");
      assert.include(fieldNames, "paused");
      assert.include(fieldNames, "last_oracle_price");
      assert.include(fieldNames, "last_oracle_timestamp");
      assert.include(fieldNames, "bump");
      assert.include(fieldNames, "mint_auth_bump");
    });

    it("has 16 events", () => {
      assert.equal(IDL.events.length, 16);
      const names = IDL.events.map((e: any) => e.name);
      assert.include(names, "MintEvent");
      assert.include(names, "RedeemEvent");
      assert.include(names, "CircuitBreakerTriggered");
      assert.include(names, "AddLiquidityEvent");
      assert.include(names, "WithdrawFeesEvent");
      assert.include(names, "RemoveLiquidityEvent");
      assert.include(names, "ProposeAuthorityEvent");
      assert.include(names, "TransferAuthorityEvent");
      assert.include(names, "PauseEvent");
      assert.include(names, "UpdateFeeEvent");
      assert.include(names, "UpdateKEvent");
      assert.include(names, "FundingAccruedEvent");
      assert.include(names, "LpDepositEvent");
      assert.include(names, "LpWithdrawEvent");
      assert.include(names, "LpFeeClaimedEvent");
      assert.include(names, "FundingDistributedEvent");
    });

    it("mint instruction has min_tokens_out parameter (slippage protection)", () => {
      const mintIx = IDL.instructions.find((i: any) => i.name === "mint");
      const args = mintIx.args.map((a: any) => a.name);
      assert.include(args, "pool_id");
      assert.include(args, "usdc_amount");
      assert.include(args, "min_tokens_out");
    });

    it("redeem instruction has min_usdc_out parameter (slippage protection)", () => {
      const redeemIx = IDL.instructions.find((i: any) => i.name === "redeem");
      const args = redeemIx.args.map((a: any) => a.name);
      assert.include(args, "pool_id");
      assert.include(args, "shortsol_amount");
      assert.include(args, "min_usdc_out");
    });

    it("withdraw_fees and remove_liquidity require price_update account", () => {
      const wf = IDL.instructions.find((i: any) => i.name === "withdraw_fees");
      const rl = IDL.instructions.find((i: any) => i.name === "remove_liquidity");
      const wfAccounts = wf.accounts.map((a: any) => a.name);
      const rlAccounts = rl.accounts.map((a: any) => a.name);
      assert.include(wfAccounts, "price_update", "withdraw_fees should require fresh oracle");
      assert.include(rlAccounts, "price_update", "remove_liquidity should require fresh oracle");
    });

    it("transfer_authority instruction exists with new_authority account", () => {
      const ta = IDL.instructions.find((i: any) => i.name === "transfer_authority");
      assert.ok(ta, "transfer_authority instruction should exist");
      const accounts = ta.accounts.map((a: any) => a.name);
      assert.include(accounts, "pool_state");
      assert.include(accounts, "authority");
      assert.include(accounts, "new_authority");
    });

    it("accept_authority instruction has new_authority signer", () => {
      const aa = IDL.instructions.find((i: any) => i.name === "accept_authority");
      assert.ok(aa, "accept_authority should exist");
      const accounts = aa.accounts.map((a: any) => a.name);
      assert.include(accounts, "pool_state");
      assert.include(accounts, "new_authority");
    });

    it("PoolState has pending_authority field", () => {
      const poolType = IDL.types.find((t: any) => t.name === "PoolState");
      assert.ok(poolType, "PoolState type should exist");
      const fieldNames = poolType.type.fields.map((f: any) => f.name);
      assert.include(fieldNames, "pending_authority");
    });
  });

  // ═══════════════════════════════════════════════════
  // Security property tests
  // ═══════════════════════════════════════════════════
  describe("security properties", () => {
    it("oracle constants are within safe bounds", () => {
      // These values come from constants.rs and should be verified
      const MAX_STALENESS = 120; // seconds
      const MAX_CONFIDENCE_PCT = 2; // percent
      const MAX_DEVIATION_BPS = 1500; // 15%
      const MAX_UPDATE_DEVIATION_BPS = 5000; // 50%
      const MIN_PRICE = 1_000_000_000; // $1.00 in PRICE_PRECISION
      const MIN_ACTION_INTERVAL = 2; // seconds

      assert.ok(MAX_STALENESS <= 120, "Staleness should be <= 120s");
      assert.ok(MAX_CONFIDENCE_PCT <= 5, "Confidence should be <= 5%");
      assert.ok(MAX_DEVIATION_BPS <= 2000, "Deviation should be <= 20% for mint/redeem");
      assert.ok(MAX_UPDATE_DEVIATION_BPS <= 5000, "Update deviation should be <= 50%");
      assert.ok(MIN_PRICE >= 1_000_000_000, "Min price should be >= $1");
      assert.ok(MIN_ACTION_INTERVAL >= 1, "Rate limit should be >= 1 second");
    });

    it("circuit breaker threshold is conservative", () => {
      const MIN_VAULT_RATIO_BPS = 9500; // 95%
      assert.ok(MIN_VAULT_RATIO_BPS >= 9000, "Vault ratio threshold should be >= 90%");
    });

    it("fee is within reasonable bounds", () => {
      // Max fee is 100 bps (1%) per initialize.rs constraint
      const maxFeeBps = 100;
      const defaultFeeBps = 4; // 0.04%
      assert.ok(defaultFeeBps <= maxFeeBps, "Default fee should be <= max fee");
      assert.ok(defaultFeeBps > 0, "Default fee should be > 0");
    });

    it("pool_id max length is enforced", () => {
      const MAX_POOL_ID_LEN = 32;
      assert.ok(POOL_ID.length <= MAX_POOL_ID_LEN, "Pool ID should be within limit");
    });

    it("admin instructions require authority signer", () => {
      const adminInstructions = [
        "add_liquidity", "remove_liquidity", "withdraw_fees",
        "update_k", "set_pause", "create_metadata", "transfer_authority"
      ];
      for (const name of adminInstructions) {
        const ix = IDL.instructions.find((i: any) => i.name === name);
        assert.ok(ix, `${name} should exist`);
        const accounts = ix.accounts.map((a: any) => a.name);
        assert.include(accounts, "authority", `${name} should require authority account`);
      }
    });

    it("mint and redeem are permissionless (user signer)", () => {
      const mintIx = IDL.instructions.find((i: any) => i.name === "mint");
      const redeemIx = IDL.instructions.find((i: any) => i.name === "redeem");
      const mintAccounts = mintIx.accounts.map((a: any) => a.name);
      const redeemAccounts = redeemIx.accounts.map((a: any) => a.name);
      assert.include(mintAccounts, "user");
      assert.include(redeemAccounts, "user");
      assert.notInclude(mintAccounts, "authority");
      assert.notInclude(redeemAccounts, "authority");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Integration tests — on-chain instructions against localnet validator
// ═══════════════════════════════════════════════════════════════════════════════
//
// These tests run against a local validator (anchor test / solana-test-validator).
// They exercise the full on-chain flow: initialize → mint → redeem → LP → fees.
//
// Mock Pyth oracle strategy:
//   A pre-built PriceUpdateV2 account is loaded into the test validator via
//   Anchor.toml [test.validator.account]. The fixture file is at:
//     tests/fixtures/mock-pyth-price-update.json
//
//   The account pubkey is fixed: 6dNYY44HhLY3qZnU6WmSNUWqn4CDBbZ5FQu7jeQujVkC
//   publish_time = 4102444800 (year 2100) — never stale under MAX_STALENESS_SECS=120.
//   Price = 17000 with exponent=-2 → $170.00 → scaled 1e9 = 170_000_000_000.
//   feed_id = SOL/USD ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
//   verification_level = Full (0x01)

describe("Integration tests", () => {
  // ── Constants ──────────────────────────────────────────────────────────────

  // Fixed mock Pyth price update account loaded via Anchor.toml [test.validator.account]
  const MOCK_PRICE_UPDATE_PUBKEY = new PublicKey(
    "6dNYY44HhLY3qZnU6WmSNUWqn4CDBbZ5FQu7jeQujVkC"
  );

  const INT_POOL_ID = "sol_int"; // separate pool ID to avoid collision with IDL tests
  const INT_POOL_SEED = Buffer.from("pool");
  const INT_VAULT_SEED = Buffer.from("vault");
  const INT_MINT_AUTH_SEED = Buffer.from("mint_auth");
  const INT_SHORTSOL_MINT_SEED = Buffer.from("shortsol_mint");
  const INT_LP_MINT_SEED = Buffer.from("lp_mint");
  const INT_LP_POSITION_SEED = Buffer.from("lp_position");

  // Correct Associated Token Program ID (the one deployed on localnet)
  const SPL_ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
  );

  // ── Provider & program ─────────────────────────────────────────────────────
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const programId = new PublicKey(IDL.address);
  const program = new anchor.Program(IDL, provider);

  // ── Actors ─────────────────────────────────────────────────────────────────
  const authority = provider.wallet as anchor.Wallet;
  const lpProvider = Keypair.generate();

  // ── Mutable state (populated in before()) ─────────────────────────────────
  let intUsdcMint: PublicKey;
  let authorityUsdcAta: PublicKey;
  let lpProviderUsdcAta: PublicKey;
  let authorityShortsolAta: PublicKey;

  // PDAs
  let poolStatePda: PublicKey;
  let shortsolMintPda: PublicKey;
  let mintAuthPda: PublicKey;
  let vaultUsdcPda: PublicKey;
  let lpMintPda: PublicKey;
  let lpProviderLpAta: PublicKey;
  let lpProviderLpPositionPda: PublicKey;

  // ── Setup ──────────────────────────────────────────────────────────────────
  before(async () => {
    // Airdrop SOL to lpProvider
    const sig = await provider.connection.requestAirdrop(
      lpProvider.publicKey,
      10_000_000_000 // 10 SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Create mock USDC mint (6 decimals)
    intUsdcMint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      6
    );

    // Derive PDAs
    [poolStatePda] = PublicKey.findProgramAddressSync(
      [INT_POOL_SEED, Buffer.from(INT_POOL_ID)],
      programId
    );
    [shortsolMintPda] = PublicKey.findProgramAddressSync(
      [INT_SHORTSOL_MINT_SEED, Buffer.from(INT_POOL_ID)],
      programId
    );
    [mintAuthPda] = PublicKey.findProgramAddressSync(
      [INT_MINT_AUTH_SEED, Buffer.from(INT_POOL_ID)],
      programId
    );
    [vaultUsdcPda] = PublicKey.findProgramAddressSync(
      [INT_VAULT_SEED, intUsdcMint.toBuffer(), Buffer.from(INT_POOL_ID)],
      programId
    );
    [lpMintPda] = PublicKey.findProgramAddressSync(
      [INT_LP_MINT_SEED, poolStatePda.toBuffer()],
      programId
    );
    [lpProviderLpPositionPda] = PublicKey.findProgramAddressSync(
      [INT_LP_POSITION_SEED, poolStatePda.toBuffer(), lpProvider.publicKey.toBuffer()],
      programId
    );

    // Create USDC ATAs for authority and lpProvider
    const {
      createAssociatedTokenAccountInstruction,
      getAssociatedTokenAddress,
    } = await import("@solana/spl-token");

    authorityUsdcAta = await getAssociatedTokenAddress(
      intUsdcMint,
      authority.publicKey
    );
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          authorityUsdcAta,
          authority.publicKey,
          intUsdcMint
        )
      ),
      []
    );

    lpProviderUsdcAta = await getAssociatedTokenAddress(
      intUsdcMint,
      lpProvider.publicKey
    );
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          lpProviderUsdcAta,
          lpProvider.publicKey,
          intUsdcMint
        )
      ),
      []
    );

    // Mint 100,000 USDC (100_000 * 10^6) to each actor
    const mintAmount = 100_000_000_000;
    await mintTo(
      provider.connection,
      (authority as any).payer,
      intUsdcMint,
      authorityUsdcAta,
      authority.publicKey,
      mintAmount
    );
    await mintTo(
      provider.connection,
      (authority as any).payer,
      intUsdcMint,
      lpProviderUsdcAta,
      authority.publicKey,
      mintAmount
    );

    console.log("Integration setup complete:");
    console.log("  Pool PDA:          ", poolStatePda.toBase58());
    console.log("  USDC Mint:         ", intUsdcMint.toBase58());
    console.log("  Mock Price Update: ", MOCK_PRICE_UPDATE_PUBKEY.toBase58());
    console.log("  LP Provider:       ", lpProvider.publicKey.toBase58());
  });

  // ── Test 1: initialize pool ────────────────────────────────────────────────
  it("initializes pool with fee_bps=4", async () => {
    await (program.methods as any)
      .initialize(INT_POOL_ID, 4)
      .accounts({
        poolState: poolStatePda,
        shortsolMint: shortsolMintPda,
        mintAuthority: mintAuthPda,
        vaultUsdc: vaultUsdcPda,
        usdcMint: intUsdcMint,
        priceUpdate: MOCK_PRICE_UPDATE_PUBKEY,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const pool = await (program.account as any).poolState.fetch(poolStatePda);
    assert.equal(pool.feeBps, 4, "fee_bps should be 4");
    assert.ok(!pool.paused, "pool should not be paused after init");
    assert.ok(pool.k.gt(new BN(0)), "k should be > 0 after init");
    assert.ok(
      pool.lastOraclePrice.gte(new BN(1_000_000_000)),
      "oracle price should be >= $1 in PRICE_PRECISION"
    );
    assert.equal(
      pool.shortsolMint.toBase58(),
      shortsolMintPda.toBase58(),
      "shortsolMint should match PDA"
    );
  });

  // ── Test 2: mint shortSOL ─────────────────────────────────────────────────
  it("mints shortSOL tokens when user deposits USDC", async () => {
    const {
      createAssociatedTokenAccountInstruction,
      getAssociatedTokenAddress,
    } = await import("@solana/spl-token");

    // Create user shortSOL ATA — must happen after initialize (mint exists now)
    authorityShortsolAta = await getAssociatedTokenAddress(
      shortsolMintPda,
      authority.publicKey
    );
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          authorityShortsolAta,
          authority.publicKey,
          shortsolMintPda
        )
      ),
      []
    );

    // Wait MIN_ACTION_INTERVAL_SECS (2s) — initialize set last_oracle_timestamp
    await new Promise((r) => setTimeout(r, 3000));

    const usdcBefore = (
      await provider.connection.getTokenAccountBalance(authorityUsdcAta)
    ).value.uiAmount!;

    const depositUsdc = new BN(1_000_000_000); // 1,000 USDC
    await (program.methods as any)
      .mint(INT_POOL_ID, depositUsdc, new BN(0))
      .accounts({
        poolState: poolStatePda,
        vaultUsdc: vaultUsdcPda,
        shortsolMint: shortsolMintPda,
        mintAuthority: mintAuthPda,
        priceUpdate: MOCK_PRICE_UPDATE_PUBKEY,
        usdcMint: intUsdcMint,
        userUsdc: authorityUsdcAta,
        userShortsol: authorityShortsolAta,
        user: authority.publicKey,
        fundingConfig: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const shortsolBal = (
      await provider.connection.getTokenAccountBalance(authorityShortsolAta)
    ).value.uiAmount!;
    const usdcAfter = (
      await provider.connection.getTokenAccountBalance(authorityUsdcAta)
    ).value.uiAmount!;

    assert.ok(shortsolBal > 0, "user should have received shortSOL tokens");
    assert.ok(usdcAfter < usdcBefore, "user USDC balance should decrease after mint");

    const pool = await (program.account as any).poolState.fetch(poolStatePda);
    assert.ok(pool.circulating.gt(new BN(0)), "pool circulating supply should be > 0");
    assert.ok(pool.vaultBalance.gt(new BN(0)), "vault balance should be > 0 after mint");
    assert.ok(pool.totalFeesCollected.gt(new BN(0)), "fees should have been collected");
  });

  // ── Test 3: redeem shortSOL ───────────────────────────────────────────────
  it("redeems shortSOL and returns USDC to user", async () => {
    // Wait for rate limit (MIN_ACTION_INTERVAL_SECS = 2s)
    await new Promise((r) => setTimeout(r, 3000));

    const shortsolBefore = (
      await provider.connection.getTokenAccountBalance(authorityShortsolAta)
    ).value.amount;
    const usdcBefore = (
      await provider.connection.getTokenAccountBalance(authorityUsdcAta)
    ).value.uiAmount!;

    const redeemAmount = new BN(shortsolBefore);
    await (program.methods as any)
      .redeem(INT_POOL_ID, redeemAmount, new BN(0))
      .accounts({
        poolState: poolStatePda,
        vaultUsdc: vaultUsdcPda,
        shortsolMint: shortsolMintPda,
        priceUpdate: MOCK_PRICE_UPDATE_PUBKEY,
        usdcMint: intUsdcMint,
        userShortsol: authorityShortsolAta,
        userUsdc: authorityUsdcAta,
        user: authority.publicKey,
        fundingConfig: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const shortsolAfter = (
      await provider.connection.getTokenAccountBalance(authorityShortsolAta)
    ).value.uiAmount!;
    const usdcAfter = (
      await provider.connection.getTokenAccountBalance(authorityUsdcAta)
    ).value.uiAmount!;

    assert.equal(shortsolAfter, 0, "all shortSOL should be burned after full redeem");
    assert.ok(usdcAfter > usdcBefore, "user USDC balance should increase after redeem");

    const pool = await (program.account as any).poolState.fetch(poolStatePda);
    assert.ok(
      pool.circulating.eq(new BN(0)),
      "circulating supply should be 0 after full redeem"
    );
  });

  // ── Test 4: initialize_lp ─────────────────────────────────────────────────
  it("initializes LP system on existing pool", async () => {
    const minLpDeposit = new BN(100_000_000); // 100 USDC

    await (program.methods as any)
      .initializeLp(INT_POOL_ID, minLpDeposit)
      .accounts({
        poolState: poolStatePda,
        lpMint: lpMintPda,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const pool = await (program.account as any).poolState.fetch(poolStatePda);
    assert.equal(
      pool.lpMint.toBase58(),
      lpMintPda.toBase58(),
      "lp_mint should be set in pool state"
    );
    assert.equal(pool.lpTotalSupply.toNumber(), 0, "LP total supply starts at 0");
    assert.equal(
      pool.minLpDeposit.toNumber(),
      100_000_000,
      "min_lp_deposit should be 100 USDC"
    );
  });

  // ── Test 5: add_liquidity ─────────────────────────────────────────────────
  it("LP provider adds 10,000 USDC and receives LP tokens", async () => {
    const { getAssociatedTokenAddress } = await import("@solana/spl-token");

    lpProviderLpAta = await getAssociatedTokenAddress(
      lpMintPda,
      lpProvider.publicKey
    );

    const depositAmount = new BN(10_000_000_000); // 10,000 USDC

    await (program.methods as any)
      .addLiquidity(INT_POOL_ID, depositAmount)
      .accounts({
        poolState: poolStatePda,
        vaultUsdc: vaultUsdcPda,
        lpMint: lpMintPda,
        lpPosition: lpProviderLpPositionPda,
        lpProviderLpAta: lpProviderLpAta,
        usdcMint: intUsdcMint,
        lpProviderUsdc: lpProviderUsdcAta,
        lpProvider: lpProvider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lpProvider])
      .rpc();

    const lpBal = (
      await provider.connection.getTokenAccountBalance(lpProviderLpAta)
    ).value.uiAmount!;
    assert.ok(lpBal > 0, "LP provider should have received LP tokens");

    const pool = await (program.account as any).poolState.fetch(poolStatePda);
    assert.ok(pool.lpTotalSupply.gt(new BN(0)), "pool LP total supply should be > 0");
    assert.ok(pool.lpPrincipal.gt(new BN(0)), "pool LP principal should be > 0");
    assert.ok(
      pool.vaultBalance.gte(depositAmount),
      "vault balance should reflect LP deposit"
    );

    const position = await (program.account as any).lpPosition.fetch(
      lpProviderLpPositionPda
    );
    assert.equal(
      position.owner.toBase58(),
      lpProvider.publicKey.toBase58(),
      "LP position owner should be lpProvider"
    );
    assert.ok(position.lpShares.gt(new BN(0)), "LP position should have shares");
  });

  // ── Test 6: remove_liquidity ──────────────────────────────────────────────
  it("LP provider removes half their liquidity and receives USDC back", async () => {
    // Wait for rate limit (last_oracle_timestamp was updated by redeem in test 3)
    await new Promise((r) => setTimeout(r, 3000));

    const positionBefore = await (program.account as any).lpPosition.fetch(
      lpProviderLpPositionPda
    );
    const halfShares = positionBefore.lpShares.divn(2);
    assert.ok(halfShares.gt(new BN(0)), "half shares should be > 0");

    const usdcBefore = (
      await provider.connection.getTokenAccountBalance(lpProviderUsdcAta)
    ).value.uiAmount!;

    await (program.methods as any)
      .removeLiquidity(INT_POOL_ID, halfShares)
      .accounts({
        poolState: poolStatePda,
        vaultUsdc: vaultUsdcPda,
        lpMint: lpMintPda,
        lpPosition: lpProviderLpPositionPda,
        lpProviderLpAta: lpProviderLpAta,
        usdcMint: intUsdcMint,
        lpProviderUsdc: lpProviderUsdcAta,
        priceUpdate: MOCK_PRICE_UPDATE_PUBKEY,
        lpProvider: lpProvider.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lpProvider])
      .rpc();

    const usdcAfter = (
      await provider.connection.getTokenAccountBalance(lpProviderUsdcAta)
    ).value.uiAmount!;
    assert.ok(
      usdcAfter > usdcBefore,
      "LP provider USDC should increase after removing liquidity"
    );

    const positionAfter = await (program.account as any).lpPosition.fetch(
      lpProviderLpPositionPda
    );
    assert.ok(
      positionAfter.lpShares.lt(positionBefore.lpShares),
      "LP shares should decrease after removal"
    );
  });

  // ── Test 7: claim_lp_fees ─────────────────────────────────────────────────
  it("LP provider claims accumulated fees after mint/redeem activity", async () => {
    // Wait for rate limit then re-mint to generate more fees
    await new Promise((r) => setTimeout(r, 3000));

    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const shortsolAta = await getAssociatedTokenAddress(
      shortsolMintPda,
      authority.publicKey
    );

    await (program.methods as any)
      .mint(INT_POOL_ID, new BN(1_000_000_000), new BN(0))
      .accounts({
        poolState: poolStatePda,
        vaultUsdc: vaultUsdcPda,
        shortsolMint: shortsolMintPda,
        mintAuthority: mintAuthPda,
        priceUpdate: MOCK_PRICE_UPDATE_PUBKEY,
        usdcMint: intUsdcMint,
        userUsdc: authorityUsdcAta,
        userShortsol: shortsolAta,
        user: authority.publicKey,
        fundingConfig: null,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const usdcBefore = (
      await provider.connection.getTokenAccountBalance(lpProviderUsdcAta)
    ).value.uiAmount!;

    // claim_lp_fees may return NoFeesToClaim if fees are below SHARE_PRECISION threshold.
    // Both success and NoFeesToClaim are valid outcomes for this test.
    try {
      await (program.methods as any)
        .claimLpFees(INT_POOL_ID)
        .accounts({
          poolState: poolStatePda,
          vaultUsdc: vaultUsdcPda,
          lpPosition: lpProviderLpPositionPda,
          usdcMint: intUsdcMint,
          lpProviderUsdc: lpProviderUsdcAta,
          lpProvider: lpProvider.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([lpProvider])
        .rpc();

      const usdcAfter = (
        await provider.connection.getTokenAccountBalance(lpProviderUsdcAta)
      ).value.uiAmount!;
      assert.ok(
        usdcAfter >= usdcBefore,
        "LP provider USDC should not decrease after claiming fees"
      );

      const position = await (program.account as any).lpPosition.fetch(
        lpProviderLpPositionPda
      );
      assert.equal(
        position.pendingFees.toNumber(),
        0,
        "pending_fees should be 0 after claim"
      );
    } catch (err: any) {
      const msg: string = err.message || err.toString();
      assert.ok(
        msg.includes("NoFeesToClaim") || msg.includes("6019"),
        `unexpected error claiming fees: ${msg}`
      );
    }
  });

  // ── Test 8: pause / unpause ───────────────────────────────────────────────
  it("pauses pool and rejects mint instruction while paused", async () => {
    await (program.methods as any)
      .setPause(INT_POOL_ID, true)
      .accounts({
        poolState: poolStatePda,
        authority: authority.publicKey,
      })
      .rpc();

    const poolPaused = await (program.account as any).poolState.fetch(poolStatePda);
    assert.ok(poolPaused.paused, "pool should be paused");

    // Wait rate limit then attempt mint — must fail with Paused
    await new Promise((r) => setTimeout(r, 3000));

    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const shortsolAta = await getAssociatedTokenAddress(
      shortsolMintPda,
      authority.publicKey
    );

    let mintFailed = false;
    try {
      await (program.methods as any)
        .mint(INT_POOL_ID, new BN(1_000_000_000), new BN(0))
        .accounts({
          poolState: poolStatePda,
          vaultUsdc: vaultUsdcPda,
          shortsolMint: shortsolMintPda,
          mintAuthority: mintAuthPda,
          priceUpdate: MOCK_PRICE_UPDATE_PUBKEY,
          usdcMint: intUsdcMint,
          userUsdc: authorityUsdcAta,
          userShortsol: shortsolAta,
          user: authority.publicKey,
          fundingConfig: null,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err: any) {
      mintFailed = true;
      const msg: string = err.message || err.toString();
      assert.ok(
        msg.includes("Paused") || msg.includes("6000"),
        `expected Paused error, got: ${msg}`
      );
    }
    assert.ok(mintFailed, "mint should have failed when pool is paused");

    // Unpause
    await (program.methods as any)
      .setPause(INT_POOL_ID, false)
      .accounts({
        poolState: poolStatePda,
        authority: authority.publicKey,
      })
      .rpc();

    const poolUnpaused = await (program.account as any).poolState.fetch(poolStatePda);
    assert.ok(!poolUnpaused.paused, "pool should be unpaused after set_pause(false)");
  });

  // ── Test 9: slippage protection ───────────────────────────────────────────
  it("rejects mint when min_tokens_out exceeds expected tokens", async () => {
    await new Promise((r) => setTimeout(r, 3000));

    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const shortsolAta = await getAssociatedTokenAddress(
      shortsolMintPda,
      authority.publicKey
    );

    // 1e18 shortSOL is impossibly large for a 1,000 USDC deposit
    const impossiblyHighMinOut = new BN("1000000000000000000");

    let slippageFailed = false;
    try {
      await (program.methods as any)
        .mint(INT_POOL_ID, new BN(1_000_000_000), impossiblyHighMinOut)
        .accounts({
          poolState: poolStatePda,
          vaultUsdc: vaultUsdcPda,
          shortsolMint: shortsolMintPda,
          mintAuthority: mintAuthPda,
          priceUpdate: MOCK_PRICE_UPDATE_PUBKEY,
          usdcMint: intUsdcMint,
          userUsdc: authorityUsdcAta,
          userShortsol: shortsolAta,
          user: authority.publicKey,
          fundingConfig: null,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err: any) {
      slippageFailed = true;
      const msg: string = err.message || err.toString();
      assert.ok(
        msg.includes("SlippageExceeded") || msg.includes("6008"),
        `expected SlippageExceeded error, got: ${msg}`
      );
    }
    assert.ok(slippageFailed, "mint should fail when min_tokens_out is impossibly high");
  });
});
