import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX");
const USDC_MINT = new PublicKey("CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn");
const POOL_ID = process.argv[2] || "sol";
const FEED_IDS: Record<string, string> = {
  sol:  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  tsla: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  spy:  "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
  aapl: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
};
const SOL_USD_FEED_ID = FEED_IDS[POOL_ID] || FEED_IDS["sol"];

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const rawKey = JSON.parse(fs.readFileSync(process.env.HOME + "/solana-wallet.json", "utf-8"));
  const kp = Keypair.fromSecretKey(Uint8Array.from(rawKey));
  const wallet = new anchor.Wallet(kp);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../target/idl/solshort.json"), "utf-8"));
  const program = new anchor.Program(idl, provider);

  const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool"), Buffer.from(POOL_ID)], PROGRAM_ID);
  const [shortsolMint] = PublicKey.findProgramAddressSync([Buffer.from("shortsol_mint"), Buffer.from(POOL_ID)], PROGRAM_ID);
  const [mintAuth] = PublicKey.findProgramAddressSync([Buffer.from("mint_auth"), Buffer.from(POOL_ID)], PROGRAM_ID);
  const [vaultUsdc] = PublicKey.findProgramAddressSync([Buffer.from("vault"), USDC_MINT.toBuffer(), Buffer.from(POOL_ID)], PROGRAM_ID);
  const [fundingPda] = PublicKey.findProgramAddressSync([Buffer.from("funding"), poolPda.toBuffer()], PROGRAM_ID);
  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, kp.publicKey);
  const userShortsol = await getAssociatedTokenAddress(shortsolMint, kp.publicKey);

  console.log("fundingConfig:", fundingPda.toBase58());

  // Step 1: Post Pyth price update
  const resp = await fetch(
    `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}&encoding=base64`
  );
  const data: any = await resp.json();

  const pythReceiver = new PythSolanaReceiver({ connection: conn, wallet: wallet as any });
  const txBuilder = pythReceiver.newTransactionBuilder({ closeUpdateAccounts: false });
  await txBuilder.addPostPriceUpdates(data.binary.data);

  let priceUpdateAccount: PublicKey;
  await txBuilder.addPriceConsumerInstructions(async (get: any) => {
    try { priceUpdateAccount = get("0x" + SOL_USD_FEED_ID); }
    catch { priceUpdateAccount = get(SOL_USD_FEED_ID); }
    return [];
  });

  const postTxs = await txBuilder.buildVersionedTransactions({ tightComputeBudget: false });
  for (const entry of postTxs) {
    const vtx: any = (entry as any).tx || entry;
    const signers: Keypair[] = (entry as any).signers || [];
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    vtx.message.recentBlockhash = blockhash;
    if (signers.length > 0) vtx.sign(signers);
    const signed = await wallet.signTransaction(vtx);
    const sig = await conn.sendTransaction(signed);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("Price posted:", sig.substring(0, 30) + "...");
  }
  console.log("priceUpdateAccount:", priceUpdateAccount!.toBase58());

  // Step 2: Regular TX with updatePrice + mint
  const updatePriceIx = await (program.methods as any)
    .updatePrice(POOL_ID)
    .accounts({ poolState: poolPda, pythPrice: priceUpdateAccount!, payer: kp.publicKey })
    .instruction();

  const mintIx = await (program.methods as any)
    .mint(POOL_ID, new anchor.BN(1_000_000), new anchor.BN(0))
    .accountsStrict({
      poolState: poolPda, vaultUsdc, shortsolMint, mintAuthority: mintAuth,
      priceUpdate: priceUpdateAccount!, usdcMint: USDC_MINT,
      userUsdc, userShortsol, user: kp.publicKey,
      fundingConfig: fundingPda,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();

  console.log("Mint ix accounts:");
  mintIx.keys.forEach((k: any, i: number) => {
    console.log(`  ${i}: ${k.pubkey.toBase58()} ${k.isSigner ? "S" : ""} ${k.isWritable ? "W" : ""}`);
  });

  const tx = new Transaction().add(updatePriceIx).add(mintIx);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = kp.publicKey;
  tx.sign(kp);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log("MINT SUCCESS:", sig);
  console.log("Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
}

main().catch((e: any) => {
  console.error("FAILED:", e.message?.substring(0, 300));
  if (e.logs) e.logs.forEach((l: string) => console.log(l));
});
