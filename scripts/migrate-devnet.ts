import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const rawKey = JSON.parse(fs.readFileSync(process.env.HOME + "/solana-wallet.json", "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../target/idl/solshort.json"), "utf-8"));
  const program = new anchor.Program(idl, provider);
  const programId = new PublicKey(idl.address);

  const POOL_ID = "sol";
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(POOL_ID)],
    programId
  );

  console.log("Pool PDA:", poolPda.toBase58());
  console.log("Authority:", keypair.publicKey.toBase58());

  // 1. migrate_pool — realloc аккаунт
  console.log("\n--- migrate_pool ---");
  const migrateSig = await (program.methods as any)
    .migratePool(POOL_ID)
    .accounts({
      poolState: poolPda,
      authority: keypair.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
  await connection.confirmTransaction(migrateSig, "confirmed");
  console.log("migrate_pool tx:", migrateSig);

  // 2. initialize_lp — создаёт LP mint
  console.log("\n--- initialize_lp ---");
  const [lpMintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_mint"), poolPda.toBuffer()],
    programId
  );

  const initLpSig = await (program.methods as any)
    .initializeLp(POOL_ID, new anchor.BN(100_000_000))
    .accounts({
      poolState: poolPda,
      lpMint: lpMintPda,
      authority: keypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
  await connection.confirmTransaction(initLpSig, "confirmed");
  console.log("initialize_lp tx:", initLpSig);

  // 3. Проверяем результат
  const poolAcc = await (program.account as any).poolState.fetch(poolPda);
  console.log("\n--- Pool State ---");
  console.log("lp_mint:", poolAcc.lpMint.toBase58());
  console.log("lp_total_supply:", poolAcc.lpTotalSupply.toString());
  console.log("min_lp_deposit:", poolAcc.minLpDeposit.toString());
  console.log("vault_balance:", poolAcc.vaultBalance.toString());
  console.log("circulating:", poolAcc.circulating.toString());
  console.log("k:", poolAcc.k.toString());
  console.log("paused:", poolAcc.paused);
}

main().catch(console.error);
