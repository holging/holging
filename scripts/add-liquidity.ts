/**
 * Add USDC liquidity to the Holging vault.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"types":["node"],"lib":["es2015"],"module":"commonjs","target":"es6","esModuleInterop":true}' scripts/add-liquidity.ts <USDC_AMOUNT>
 *
 * Example:
 *   npx ts-node ... scripts/add-liquidity.ts 500
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";
const POOL_ID = process.argv[3] || "sol";
const USDC_MINT = new PublicKey("CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn");

const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");

async function main() {
  const amountArg = process.argv[2];
  if (!amountArg) {
    console.error("Usage: add-liquidity.ts <USDC_AMOUNT>");
    console.error("Example: add-liquidity.ts 500");
    process.exit(1);
  }

  const usdcAmount = parseFloat(amountArg);
  if (isNaN(usdcAmount) || usdcAmount <= 0) {
    console.error("Invalid amount:", amountArg);
    process.exit(1);
  }

  const usdcLamports = Math.round(usdcAmount * 1e6); // 6 decimals

  // Load wallet
  const walletPath =
    process.env.ANCHOR_WALLET || `${process.env.HOME}/solana-wallet.json`;
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
  console.log("Authority:", keypair.publicKey.toBase58());

  // Connection & provider
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load IDL & program
  const idlPath = path.resolve(__dirname, "../target/idl/holging.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider);
  console.log("Program ID:", programId.toBase58());

  // Derive PDAs
  const poolIdBuf = Buffer.from(POOL_ID);
  const [poolPda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, poolIdBuf],
    programId
  );
  const [vaultUsdc] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, USDC_MINT.toBuffer(), poolIdBuf],
    programId
  );

  // Authority's USDC ATA
  const authorityUsdc = await getAssociatedTokenAddress(
    USDC_MINT,
    keypair.publicKey
  );

  console.log("Pool PDA:      ", poolPda.toBase58());
  console.log("Vault USDC:    ", vaultUsdc.toBase58());
  console.log("Authority USDC:", authorityUsdc.toBase58());
  console.log(`\nAdding ${usdcAmount} USDC (${usdcLamports} lamports) to vault...`);

  // Fetch pool state before
  const poolBefore = await (program.account as any).poolState.fetch(poolPda);
  console.log(
    "Vault balance before:",
    (Number(poolBefore.vaultBalance.toString()) / 1e6).toFixed(2),
    "USDC"
  );

  // Call add_liquidity
  const sig = await (program.methods as any)
    .addLiquidity(POOL_ID, new anchor.BN(usdcLamports))
    .accounts({
      poolState: poolPda,
      vaultUsdc,
      usdcMint: USDC_MINT,
      authorityUsdc,
      authority: keypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("\nTX:", sig);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );

  // Fetch pool state after
  const poolAfter = await (program.account as any).poolState.fetch(poolPda);
  console.log(
    "\nVault balance after:",
    (Number(poolAfter.vaultBalance.toString()) / 1e6).toFixed(2),
    "USDC"
  );
  console.log("Liquidity added successfully!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
