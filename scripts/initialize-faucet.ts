/**
 * Initialize on-chain USDC faucet and deposit USDC.
 *
 * Usage:
 *   npx ts-node scripts/initialize-faucet.ts
 *   npx ts-node scripts/initialize-faucet.ts deposit <AMOUNT_USDC>
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const RPC_URL = "https://api.devnet.solana.com";
const FAUCET_PROGRAM_ID = new PublicKey("BqisdDoAVUH8KH2uAspUfCYSiiAwdLvuEepk1R8A7hGn");
const USDC_MINT = new PublicKey("CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn");

// 5,000 USDC (6 decimals)
const CLAIM_AMOUNT = new anchor.BN(5_000_000_000);
// 24 hours
const RATE_LIMIT_SECS = new anchor.BN(86_400);

function loadWallet(): Keypair {
  const walletPath = path.join(os.homedir(), "solana-wallet.json");
  const secret = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const mode = process.argv[2] || "initialize";
  const admin = loadWallet();
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("Admin:", admin.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(admin.publicKey)) / 1e9, "SOL");

  // PDAs
  const [faucetState] = PublicKey.findProgramAddressSync(
    [Buffer.from("faucet")],
    FAUCET_PROGRAM_ID
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    FAUCET_PROGRAM_ID
  );

  console.log("FaucetState PDA:", faucetState.toBase58());
  console.log("Vault PDA:", vault.toBase58());

  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../target/idl/faucet.json"),
      "utf-8"
    )
  );

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  const program = new anchor.Program(idl, provider);

  if (mode === "initialize") {
    console.log("\nInitializing faucet...");
    const tx = await (program.methods as any)
      .initialize(CLAIM_AMOUNT, RATE_LIMIT_SECS)
      .accounts({
        admin: admin.publicKey,
        usdcMint: USDC_MINT,
        faucetState,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Faucet initialized:", tx);
    console.log("https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  } else if (mode === "deposit") {
    const amountUsdc = parseFloat(process.argv[3] || "100000");
    const amount = BigInt(Math.round(amountUsdc * 1_000_000));
    console.log(`\nDepositing ${amountUsdc} USDC into faucet vault...`);

    // Get or create admin ATA and mint USDC to it
    const adminAta = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      USDC_MINT,
      admin.publicKey
    );
    console.log("Admin ATA:", adminAta.address.toBase58());

    // Mint USDC to admin ATA (admin is mint authority)
    const mintSig = await mintTo(
      connection,
      admin,
      USDC_MINT,
      adminAta.address,
      admin,
      amount
    );
    console.log("Minted USDC:", mintSig);

    // Deposit into vault
    const tx = await (program.methods as any)
      .deposit(new anchor.BN(amount.toString()))
      .accounts({
        admin: admin.publicKey,
        faucetState,
        vault,
        adminAta: adminAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("✅ Deposited:", tx);
    console.log("https://explorer.solana.com/tx/" + tx + "?cluster=devnet");
  } else {
    console.log("Usage: npx ts-node scripts/initialize-faucet.ts [initialize|deposit <amount>]");
  }
}

main().catch(console.error);
