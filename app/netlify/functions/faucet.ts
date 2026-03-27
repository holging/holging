import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const RPC_URL = "https://api.devnet.solana.com";
const USDC_MINT = "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn";
const FAUCET_AMOUNT = 5_000_000_000; // 5000 USDC (6 decimals)
const RATE_LIMIT_MS = 60_000; // 1 minute per wallet

const recentClaims = new Map<string, number>();

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }

  try {
    const { wallet } = await req.json();
    if (!wallet || typeof wallet !== "string") {
      return Response.json({ error: "Missing wallet address" }, { status: 400 });
    }

    // Validate pubkey
    let userPubkey: PublicKey;
    try {
      userPubkey = new PublicKey(wallet);
    } catch {
      return Response.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // Rate limit
    const now = Date.now();
    const lastClaim = recentClaims.get(wallet);
    if (lastClaim && now - lastClaim < RATE_LIMIT_MS) {
      const waitSec = Math.ceil((RATE_LIMIT_MS - (now - lastClaim)) / 1000);
      return Response.json({ error: `Rate limited. Try again in ${waitSec}s` }, { status: 429 });
    }

    // Load admin keypair from env
    const keypairJson = process.env.FAUCET_KEYPAIR;
    if (!keypairJson) {
      return Response.json({ error: "Faucet not configured" }, { status: 500 });
    }
    const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairJson)));

    const connection = new Connection(RPC_URL, "confirmed");
    const usdcMint = new PublicKey(USDC_MINT);

    // Get or create user's USDC ATA
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair, // payer
      usdcMint,
      userPubkey,
    );

    // Mint USDC
    const signature = await mintTo(
      connection,
      adminKeypair, // payer
      usdcMint,
      userAta.address,
      adminKeypair, // mint authority
      FAUCET_AMOUNT,
    );

    recentClaims.set(wallet, now);

    return Response.json(
      { signature, amount: 100, mint: USDC_MINT },
      { headers: { "Access-Control-Allow-Origin": "*" } },
    );
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};
