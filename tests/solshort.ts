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

// Load IDL manually since we built --no-idl
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
    // Derive PDAs
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

    // Create fake USDC mint (6 decimals)
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

    // Create user USDC account and mint 10,000 USDC
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

      // SOL doubles → shortSOL halves
      const newPrice = new BN(340).mul(PRICE_PRECISION);
      const shortsolPrice = k.mul(PRICE_PRECISION).div(newPrice);
      const expected = new BN(85).mul(PRICE_PRECISION);
      assert.ok(shortsolPrice.eq(expected));
    });

    it("holging portfolio P&L is always >= 0", () => {
      const multipliers = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0, 3.0];
      for (const x of multipliers) {
        const v = 0.5 * (x + 1 / x);
        const pnl = v - 1;
        assert.ok(pnl >= -0.0001, `Holging P&L negative at x=${x}: ${pnl}`);
      }
    });

    it("fee calculation (0.04%)", () => {
      const usdcAmount = new BN(170_000_000); // 170 USDC
      const feeBps = new BN(4);
      const bpsDenom = new BN(10_000);
      const fee = usdcAmount.mul(feeBps).div(bpsDenom);
      assert.equal(fee.toNumber(), 68_000); // $0.068
    });

    it("token mint calculation with decimal scaling", () => {
      const shortsolPrice = new BN(170).mul(PRICE_PRECISION);
      const effectiveUsdc = new BN(169_932_000);
      const scaling = new BN(1000);
      const tokens = effectiveUsdc
        .mul(scaling)
        .mul(PRICE_PRECISION)
        .div(shortsolPrice);
      // ~0.9996 shortSOL
      assert.ok(tokens.gt(new BN(999_000_000)));
      assert.ok(tokens.lt(new BN(1_000_000_000)));
    });

    it("k cancels out in return calculation", () => {
      // Return = P0/P1 - 1, independent of k
      const k1 = new BN(28900).mul(PRICE_PRECISION);
      const k2 = new BN(50000).mul(PRICE_PRECISION);
      const p0 = new BN(170).mul(PRICE_PRECISION);
      const p1 = new BN(100).mul(PRICE_PRECISION);

      // shortSOL return with k1
      const ss0_k1 = k1.mul(PRICE_PRECISION).div(p0);
      const ss1_k1 = k1.mul(PRICE_PRECISION).div(p1);
      // return = ss1/ss0 - 1 = (k1/p1) / (k1/p0) - 1 = p0/p1 - 1

      // shortSOL return with k2
      const ss0_k2 = k2.mul(PRICE_PRECISION).div(p0);
      const ss1_k2 = k2.mul(PRICE_PRECISION).div(p1);

      // Both should give same return: p0/p1 = 170/100 = 1.7 → 70% return
      const ret1 = ss1_k1.mul(PRICE_PRECISION).div(ss0_k1);
      const ret2 = ss1_k2.mul(PRICE_PRECISION).div(ss0_k2);
      assert.ok(ret1.eq(ret2), "Returns should be equal regardless of k");
    });
  });

  describe("error codes", () => {
    it("has all expected error codes", () => {
      const errors = IDL.errors;
      assert.equal(errors.length, 13);
      assert.equal(errors[0].name, "Paused");
      assert.equal(errors[6].name, "CircuitBreaker");
      assert.equal(errors[9].name, "MathOverflow");
      assert.equal(errors[12].name, "CirculatingNotZero");
    });
  });

  describe("IDL validation", () => {
    it("has 7 instructions", () => {
      assert.equal(IDL.instructions.length, 7);
      const names = IDL.instructions.map((i: any) => i.name);
      assert.include(names, "add_liquidity");
      assert.include(names, "create_metadata");
      assert.include(names, "initialize");
      assert.include(names, "mint");
      assert.include(names, "redeem");
      assert.include(names, "update_k");
      assert.include(names, "set_pause");
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
      assert.include(fieldNames, "bump");
      assert.include(fieldNames, "mint_auth_bump");
    });

    it("has 4 events", () => {
      assert.equal(IDL.events.length, 4);
      const names = IDL.events.map((e: any) => e.name);
      assert.include(names, "MintEvent");
      assert.include(names, "RedeemEvent");
      assert.include(names, "CircuitBreakerTriggered");
      assert.include(names, "AddLiquidityEvent");
    });
  });
});
