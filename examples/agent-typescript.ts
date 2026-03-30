/**
 * Holging Agent Example — TypeScript
 *
 * Full cycle: claim USDC → check prices → simulate → mint → check position → redeem
 *
 * Usage:
 *   npx ts-node examples/agent-typescript.ts
 *   # or: node examples/agent-typescript.ts (if compiled)
 *
 * Requires:
 *   npm install @solana/web3.js
 *   A Solana devnet wallet at ./wallet.json (or set WALLET_PATH env)
 */

import { Connection, Keypair, Transaction } from "@solana/web3.js";
import * as fs from "fs";

const API = process.env.HOLGING_API || "https://api.holging.com";
const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const WALLET_PATH = process.env.WALLET_PATH || "./wallet.json";

const conn = new Connection(RPC, "confirmed");

function loadKeypair(): Keypair {
  if (!fs.existsSync(WALLET_PATH)) {
    console.log(`Creating new wallet at ${WALLET_PATH}...`);
    const kp = Keypair.generate();
    fs.writeFileSync(WALLET_PATH, JSON.stringify(Array.from(kp.secretKey)));
    return kp;
  }
  const raw = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function api(path: string, body?: any): Promise<any> {
  const opts: any = { headers: { "Content-Type": "application/json" } };
  if (body) {
    opts.method = "POST";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

async function signAndSend(txBase64: string, keypair: Keypair): Promise<string> {
  const tx = Transaction.from(Buffer.from(txBase64, "base64"));
  tx.sign(keypair);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

function log(step: string, data: any) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${step}`);
  console.log(`${"═".repeat(60)}`);
  if (typeof data === "string") console.log(data);
  else console.log(JSON.stringify(data, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const keypair = loadKeypair();
  const wallet = keypair.publicKey.toBase58();
  console.log(`\n🤖 Holging Agent — TypeScript Example`);
  console.log(`   Wallet: ${wallet}`);
  console.log(`   API:    ${API}`);

  // Step 1: Claim USDC from faucet
  log("Step 1: Claim devnet USDC", "Requesting 5,000 USDC from on-chain faucet...");
  try {
    const claim = await api("/build/claim_usdc", { wallet });
    if (claim.tx) {
      const sig = await signAndSend(claim.tx, keypair);
      console.log(`  ✅ Claimed! tx: ${sig.slice(0, 16)}...`);
    } else {
      console.log(`  ⚠ ${claim.error || "Unknown error"}`);
    }
  } catch (e: any) {
    console.log(`  ⏳ Already claimed today or insufficient SOL for gas`);
  }

  // Step 2: Check all prices
  log("Step 2: Market scan", "Fetching all pool prices...");
  const prices = await api("/prices");
  for (const [id, p] of Object.entries(prices.prices) as any) {
    if (p.error) {
      console.log(`  ${id}: ${p.error}`);
    } else {
      console.log(`  ${p.asset.padEnd(5)} $${p.assetPrice.toFixed(2).padStart(8)} | ${p.token.padEnd(12)} $${p.tokenPrice.toFixed(4).padStart(10)} | vault ${p.vaultBalance}`);
    }
  }

  // Step 3: Check position
  log("Step 3: Check position", "");
  const pos = await api(`/position?wallet=${wallet}&pool=sol`);
  console.log(`  SOL:      ${pos.sol}`);
  console.log(`  USDC:     $${pos.usdc}`);
  console.log(`  shortSOL: ${pos.shortSOL}`);

  if (pos.usdc < 100) {
    console.log("\n  ⚠ Not enough USDC to trade. Need SOL for gas + claim USDC first.");
    return;
  }

  // Step 4: Simulate mint
  const mintAmount = 100;
  log(`Step 4: Simulate mint $${mintAmount}`, "");
  const sim = await api(`/simulate/mint?amount=${mintAmount}&pool=sol`);
  console.log(`  Expected: ${sim.expectedTokens} shortSOL`);
  console.log(`  Fee:      ${sim.fee}`);
  console.log(`  Price:    SOL $${sim.assetPrice} → shortSOL $${sim.tokenPrice}`);

  // Step 5: Build and execute mint
  log(`Step 5: Mint $${mintAmount} USDC → shortSOL`, "Building transaction...");
  const mint = await api("/build/mint", { wallet, amount: mintAmount, pool: "sol" });
  if (mint.error) {
    console.log(`  ❌ ${mint.error}`);
    return;
  }
  console.log(`  Expected: ${mint.expectedTokens} shortSOL | Fee: ${mint.fee}`);
  console.log(`  Signing and submitting...`);
  const mintSig = await signAndSend(mint.tx, keypair);
  console.log(`  ✅ Minted! tx: ${mintSig.slice(0, 16)}...`);

  // Step 6: Verify position
  log("Step 6: Verify position", "");
  const posAfter = await api(`/position?wallet=${wallet}&pool=sol`);
  console.log(`  SOL:      ${posAfter.sol}`);
  console.log(`  USDC:     $${posAfter.usdc}`);
  console.log(`  shortSOL: ${posAfter.shortSOL}`);

  // Step 7: Wait and redeem
  log("Step 7: Redeem all shortSOL", "Waiting 3s for rate limit...");
  await new Promise(r => setTimeout(r, 3000));

  if (posAfter.shortSOL > 0) {
    const redeem = await api("/build/redeem", { wallet, amount: posAfter.shortSOL, pool: "sol" });
    if (redeem.error) {
      console.log(`  ❌ ${redeem.error}`);
    } else {
      console.log(`  Expected: $${redeem.expectedUsdc} USDC | Fee: ${redeem.fee}`);
      const redeemSig = await signAndSend(redeem.tx, keypair);
      console.log(`  ✅ Redeemed! tx: ${redeemSig.slice(0, 16)}...`);
    }
  }

  // Step 8: Final position
  log("Step 8: Final position", "");
  const posFinal = await api(`/position?wallet=${wallet}&pool=sol`);
  console.log(`  SOL:      ${posFinal.sol}`);
  console.log(`  USDC:     $${posFinal.usdc}`);
  console.log(`  shortSOL: ${posFinal.shortSOL}`);
  console.log(`\n🏁 Done! Full cycle: claim → prices → simulate → mint → redeem → verify`);
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
