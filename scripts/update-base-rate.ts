/**
 * Update Base Rate — sets rate_bps for all 4 devnet pools.
 *
 * Usage:
 *   npx ts-node scripts/update-base-rate.ts          # sets rate_bps=3 for all pools
 *   npx ts-node scripts/update-base-rate.ts 5        # sets rate_bps=5 for all pools
 *   npx ts-node scripts/update-base-rate.ts --dry-run # shows what would happen without sending txs
 *
 * Env variables (optional):
 *   ANCHOR_WALLET  — path to admin keypair (default ~/solana-wallet.json)
 *   RPC_URL        — RPC endpoint (default devnet)
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const DEVNET_RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const DEFAULT_RATE_BPS = 3;

const POOL_IDS = ["sol", "tsla", "spy", "aapl"];

// PDA seeds (must match on-chain program)
const POOL_SEED = Buffer.from("pool");
const FUNDING_SEED = Buffer.from("funding");

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rateArg = args.find((a) => !a.startsWith("--"));
  const rateBps = rateArg ? parseInt(rateArg, 10) : DEFAULT_RATE_BPS;

  if (isNaN(rateBps) || rateBps < 0 || rateBps > 1000) {
    console.error(`Invalid rate_bps: ${rateArg}. Must be 0–1000.`);
    process.exit(1);
  }

  // Load admin wallet
  const walletPath =
    process.env.ANCHOR_WALLET || `${process.env.HOME}/solana-wallet.json`;
  if (!fs.existsSync(walletPath)) {
    console.error(`Wallet not found: ${walletPath}`);
    process.exit(1);
  }
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));

  // Setup Anchor
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.resolve(__dirname, "../target/idl/holging.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl, provider);
  const programId = new PublicKey(idl.address);

  console.log(`[update-base-rate] Admin: ${keypair.publicKey.toBase58()}`);
  console.log(`[update-base-rate] RPC: ${DEVNET_RPC}`);
  console.log(`[update-base-rate] Target rate_bps: ${rateBps}`);
  console.log(`[update-base-rate] Dry run: ${dryRun}`);
  console.log();

  // Derive PDAs and update each pool
  let successCount = 0;
  let failCount = 0;

  for (const poolId of POOL_IDS) {
    const poolIdBuf = Buffer.from(poolId);
    const [poolPda] = PublicKey.findProgramAddressSync(
      [POOL_SEED, poolIdBuf],
      programId
    );
    const [fundingConfigPda] = PublicKey.findProgramAddressSync(
      [FUNDING_SEED, poolPda.toBuffer()],
      programId
    );

    console.log(`[${poolId}] Pool PDA: ${poolPda.toBase58()}`);
    console.log(`[${poolId}] FundingConfig PDA: ${fundingConfigPda.toBase58()}`);

    if (dryRun) {
      console.log(`[${poolId}] DRY RUN — would call updateFundingRate(${poolId}, ${rateBps})`);
      console.log();
      successCount++;
      continue;
    }

    try {
      const sig = await (program.methods as any)
        .updateFundingRate(poolId, rateBps)
        .accounts({
          admin: keypair.publicKey,
          poolState: poolPda,
          fundingConfig: fundingConfigPda,
        })
        .rpc();

      console.log(`[${poolId}] ✓ updateFundingRate tx: ${sig}`);
      console.log(
        `[${poolId}]   explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`
      );
      successCount++;
    } catch (err: any) {
      console.error(`[${poolId}] ✗ FAILED: ${err?.message ?? err}`);
      failCount++;
    }
    console.log();
  }

  // Verification: fetch each FundingConfig and confirm rate_bps
  if (!dryRun) {
    console.log("─── Verification ───");
    for (const poolId of POOL_IDS) {
      const poolIdBuf = Buffer.from(poolId);
      const [poolPda] = PublicKey.findProgramAddressSync(
        [POOL_SEED, poolIdBuf],
        programId
      );
      const [fundingConfigPda] = PublicKey.findProgramAddressSync(
        [FUNDING_SEED, poolPda.toBuffer()],
        programId
      );

      try {
        const cfg = await (program.account as any).fundingConfig.fetch(
          fundingConfigPda
        );
        const currentRate = cfg.rateBps;
        const status = currentRate === rateBps ? "✓" : "✗ MISMATCH";
        console.log(
          `[${poolId}] ${status} rate_bps=${currentRate} (expected ${rateBps})`
        );
      } catch (err: any) {
        console.error(
          `[${poolId}] ✗ Could not fetch FundingConfig: ${err?.message ?? err}`
        );
      }
    }
  }

  console.log();
  console.log(
    `[update-base-rate] Done. Success: ${successCount}, Failed: ${failCount}`
  );

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
