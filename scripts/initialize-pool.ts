/**
 * Initialize Holging pool on devnet.
 *
 * Usage:
 *   npx ts-node scripts/initialize-pool.ts <USDC_MINT_ADDRESS>
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PythSolanaReceiver,
  InstructionWithEphemeralSigners,
} from "@pythnetwork/pyth-solana-receiver";
import * as fs from "fs";
import * as path from "path";

// --- Config ---
const DEVNET_RPC = "https://api.devnet.solana.com";
const POOL_ID = process.argv[3] || "sol";
const FEE_BPS = 4; // 0.04%
const HERMES_URL = "https://hermes.pyth.network";

const FEED_IDS: Record<string, string> = {
  sol:  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  tsla: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  spy:  "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
  aapl: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
};
const SOL_USD_FEED_ID = FEED_IDS[POOL_ID] || FEED_IDS["sol"];

// PDA seeds
const POOL_SEED = Buffer.from("pool");
const SHORTSOL_MINT_SEED = Buffer.from("shortsol_mint");
const MINT_AUTH_SEED = Buffer.from("mint_auth");
const VAULT_SEED = Buffer.from("vault");

async function main() {
  const usdcMintArg = process.argv[2];
  if (!usdcMintArg) {
    console.error(
      "Usage: npx ts-node scripts/initialize-pool.ts <USDC_MINT>"
    );
    process.exit(1);
  }
  const usdcMint = new PublicKey(usdcMintArg);
  console.log("USDC Mint:", usdcMint.toBase58());

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
  const [shortsolMint] = PublicKey.findProgramAddressSync(
    [SHORTSOL_MINT_SEED, poolIdBuf],
    programId
  );
  const [mintAuth] = PublicKey.findProgramAddressSync(
    [MINT_AUTH_SEED, poolIdBuf],
    programId
  );
  const [vaultUsdc] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, usdcMint.toBuffer(), poolIdBuf],
    programId
  );

  console.log("Pool PDA:      ", poolPda.toBase58());
  console.log("shortSOL Mint: ", shortsolMint.toBase58());
  console.log("Mint Authority:", mintAuth.toBase58());
  console.log("Vault USDC:    ", vaultUsdc.toBase58());

  // Check if pool already exists
  const existing = await connection.getAccountInfo(poolPda);
  if (existing) {
    console.log("\nPool already initialized! Skipping.");
    process.exit(0);
  }

  // --- Step 1: Post fresh Pyth price update ---
  console.log("\nFetching fresh Pyth price from Hermes...");

  const hermesResp = await fetch(
    `${HERMES_URL}/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}&encoding=base64`
  );
  const hermesData: any = await hermesResp.json();
  const priceFeedUpdateData: string[] = hermesData.binary.data;
  console.log("Got price update data from Hermes");

  // Set up Pyth receiver
  const pythReceiver = new PythSolanaReceiver({
    connection,
    wallet: wallet as any,
  });

  // Build the postPriceUpdate + initialize instructions together
  const txBuilder = pythReceiver.newTransactionBuilder({
    closeUpdateAccounts: false,
  });
  await txBuilder.addPostPriceUpdates(priceFeedUpdateData);

  // Get the price update account from the builder
  // addPriceConsumerInstructions gives us the account
  let priceUpdateAccount: PublicKey | null = null;

  await txBuilder.addPriceConsumerInstructions(
    async (
      getPriceUpdateAccount: (
        priceFeedId: string
      ) => PublicKey
    ): Promise<InstructionWithEphemeralSigners[]> => {
      // Try both with and without 0x prefix
      try {
        priceUpdateAccount = getPriceUpdateAccount("0x" + SOL_USD_FEED_ID);
      } catch {
        priceUpdateAccount = getPriceUpdateAccount(SOL_USD_FEED_ID);
      }
      console.log("Price update account:", priceUpdateAccount.toBase58());

      // Return the initialize instruction as a consumer
      const initIx = await (program.methods as any)
        .initialize(POOL_ID, FEE_BPS)
        .accounts({
          poolState: poolPda,
          shortsolMint,
          mintAuthority: mintAuth,
          vaultUsdc,
          usdcMint,
          priceUpdate: priceUpdateAccount,
          authority: keypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      return [{ instruction: initIx, signers: [] }];
    }
  );

  // Send all transactions
  console.log("\nSending transactions...");
  const txs = await txBuilder.buildVersionedTransactions({
    tightComputeBudget: false,
  });

  for (let i = 0; i < txs.length; i++) {
    const entry: any = txs[i];
    const vtx = entry.tx || entry;
    const signers: Keypair[] = entry.signers || [];
    vtx.sign([keypair, ...signers]);
    const sig = await connection.sendTransaction(vtx);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`TX ${i + 1}/${txs.length}: ${sig}`);
    if (i === txs.length - 1) {
      console.log(
        `Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`
      );
    }
  }

  console.log("\nPool initialized!");

  // Read back pool state
  const poolAccount = await (program.account as any).poolState.fetch(poolPda);
  console.log("\n--- Pool State ---");
  console.log("Authority:  ", poolAccount.authority.toBase58());
  console.log("k:          ", poolAccount.k.toString());
  console.log("Fee (bps):  ", poolAccount.feeBps);
  console.log("SOL price:  ", poolAccount.lastOraclePrice.toString());
  console.log("shortSOL:   ", poolAccount.shortsolMint.toBase58());
  console.log("Paused:     ", poolAccount.paused);

  console.log("\n--- Next steps ---");
  console.log(
    `1. Update USDC_MINT in app/src/App.tsx to: "${usdcMint.toBase58()}"`
  );
  console.log("2. Run: cd app && npm run dev");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
