/**
 * Create Metaplex metadata for shortSOL token via the program's create_metadata instruction.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"types":["node"],"lib":["es2015"],"module":"commonjs","target":"es6","esModuleInterop":true}' scripts/create-shortsol-metadata.ts
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";
const POOL_ID = "sol";

const POOL_SEED = Buffer.from("pool");
const SHORTSOL_MINT_SEED = Buffer.from("shortsol_mint");
const MINT_AUTH_SEED = Buffer.from("mint_auth");

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

async function main() {
  // Load wallet
  const walletPath =
    process.env.ANCHOR_WALLET || "${HOME}/solana-wallet.json";
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

  // Derive Metaplex metadata PDA
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      shortsolMint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  console.log("Pool PDA:      ", poolPda.toBase58());
  console.log("shortSOL Mint: ", shortsolMint.toBase58());
  console.log("Mint Authority:", mintAuth.toBase58());
  console.log("Metadata PDA:  ", metadataPda.toBase58());

  // Check if metadata already exists
  const existingMetadata = await connection.getAccountInfo(metadataPda);
  if (existingMetadata) {
    console.log("\nMetadata already exists! Skipping.");
    process.exit(0);
  }

  // Call create_metadata instruction
  console.log("\nCreating shortSOL metadata...");
  const sig = await (program.methods as any)
    .createMetadata(
      POOL_ID,
      "Short SOL",
      "sSol",
      "" // uri - empty for now
    )
    .accounts({
      poolState: poolPda,
      shortsolMint,
      mintAuthority: mintAuth,
      metadata: metadataPda,
      authority: keypair.publicKey,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("TX:", sig);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );
  console.log("\nshortSOL metadata created!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
