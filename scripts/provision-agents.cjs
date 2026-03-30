#!/usr/bin/env node
/**
 * Holging Agent Provisioner
 * 
 * Creates N agent wallets, airdrops SOL, claims USDC from faucet.
 * Outputs ready-to-use .mcp.json configs for each agent.
 *
 * Usage:
 *   node scripts/provision-agents.cjs 10
 *   node scripts/provision-agents.cjs 10 --fund
 */

const { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = require("@solana/spl-token");
const anchor = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");
const os = require("os");

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(process.env.USDC_MINT || "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn");
const FAUCET_PROGRAM_ID = new PublicKey("BqisdDoAVUH8KH2uAspUfCYSiiAwdLvuEepk1R8A7hGn");

const AGENTS_DIR = path.resolve(__dirname, "../agents");
const MCP_SERVER_DIST = path.resolve(__dirname, "../mcp-server/dist/index.js");

const conn = new Connection(RPC_URL, "confirmed");

// ─── Fund wallet ────────────────────────────────────────────────────────────

function loadFunder() {
  const walletPath = process.env.ANCHOR_WALLET || path.join(os.homedir(), "solana-wallet.json");
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Funder wallet not found: ${walletPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function sendSol(funder, to, amountSol) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: to,
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    })
  );
  tx.feePayer = funder.publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(funder);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

async function claimFaucet(agentKp) {
  const wallet = new anchor.Wallet(agentKp);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });

  const faucetIdlPath = path.resolve(__dirname, "../target/idl/faucet.json");
  if (!fs.existsSync(faucetIdlPath)) {
    console.log("    ⚠ faucet IDL not found, skipping USDC claim");
    return null;
  }
  const faucetIdl = JSON.parse(fs.readFileSync(faucetIdlPath, "utf-8"));
  const faucetProgram = new anchor.Program(faucetIdl, provider);

  const [faucetState] = PublicKey.findProgramAddressSync([Buffer.from("faucet")], FAUCET_PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault")], FAUCET_PROGRAM_ID);
  const [claimRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), agentKp.publicKey.toBuffer()],
    FAUCET_PROGRAM_ID
  );
  const userAta = await getAssociatedTokenAddress(USDC_MINT, agentKp.publicKey);

  const tx = new Transaction();

  // Create ATA if needed
  const ataInfo = await conn.getAccountInfo(userAta);
  if (!ataInfo) {
    tx.add(createAssociatedTokenAccountInstruction(agentKp.publicKey, userAta, agentKp.publicKey, USDC_MINT));
  }

  const claimIx = await faucetProgram.methods
    .claim()
    .accounts({
      user: agentKp.publicKey,
      faucetState,
      vault,
      claimRecord,
      userAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  tx.add(claimIx);
  tx.feePayer = agentKp.publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(agentKp);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const numAgents = parseInt(process.argv[2] || "10", 10);
  const shouldFund = process.argv.includes("--fund");

  console.log(`\n🤖 Holging Agent Provisioner`);
  console.log(`   Creating ${numAgents} agent wallets...\n`);

  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }

  const funder = shouldFund ? loadFunder() : null;
  if (funder) {
    const bal = await conn.getBalance(funder.publicKey);
    console.log(`💰 Funder: ${funder.publicKey.toBase58()} (${(bal / LAMPORTS_PER_SOL).toFixed(2)} SOL)\n`);
  }

  const agents = [];

  for (let i = 1; i <= numAgents; i++) {
    const name = `agent-${String(i).padStart(2, "0")}`;
    const walletPath = path.join(AGENTS_DIR, `${name}.json`);

    let kp;
    if (fs.existsSync(walletPath)) {
      const raw = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
      kp = Keypair.fromSecretKey(Uint8Array.from(raw));
      console.log(`  ${name}: ${kp.publicKey.toBase58()} (existing)`);
    } else {
      kp = Keypair.generate();
      fs.writeFileSync(walletPath, JSON.stringify(Array.from(kp.secretKey)));
      console.log(`  ${name}: ${kp.publicKey.toBase58()} (created)`);
    }

    if (shouldFund && funder) {
      try {
        // Send 0.1 SOL for gas
        const bal = await conn.getBalance(kp.publicKey);
        if (bal < 0.05 * LAMPORTS_PER_SOL) {
          const sig = await sendSol(funder, kp.publicKey, 0.1);
          console.log(`    ✅ Sent 0.1 SOL (tx: ${sig.slice(0, 8)}...)`);
        } else {
          console.log(`    ✅ Already has ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
        }

        // Claim USDC from faucet
        try {
          const sig = await claimFaucet(kp);
          if (sig) console.log(`    ✅ Claimed 5,000 USDC (tx: ${sig.slice(0, 8)}...)`);
        } catch (e) {
          const msg = e.message || String(e);
          if (msg.includes("RateLimited") || msg.includes("0x1770")) {
            console.log(`    ⏳ USDC already claimed today`);
          } else {
            console.log(`    ⚠ USDC claim failed: ${msg.slice(0, 60)}`);
          }
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log(`    ⚠ Funding failed: ${e.message.slice(0, 60)}`);
      }
    }

    agents.push({ name, publicKey: kp.publicKey.toBase58(), walletPath });
  }

  // Generate .mcp.json configs
  const configsDir = path.join(AGENTS_DIR, "configs");
  if (!fs.existsSync(configsDir)) {
    fs.mkdirSync(configsDir, { recursive: true });
  }

  for (const agent of agents) {
    const config = {
      mcpServers: {
        holging: {
          command: "node",
          args: [MCP_SERVER_DIST],
          env: {
            RPC_URL,
            ANCHOR_WALLET: agent.walletPath,
            USDC_MINT: USDC_MINT.toBase58(),
          },
        },
      },
    };
    const configPath = path.join(configsDir, `${agent.name}.mcp.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ ${numAgents} agents provisioned`);
  console.log(`   Wallets:  ${AGENTS_DIR}/agent-XX.json`);
  console.log(`   Configs:  ${AGENTS_DIR}/configs/agent-XX.mcp.json`);
  console.log(`${"═".repeat(60)}`);

  console.log(`\nTo give each agent its config:`);
  console.log(`  cp agents/configs/agent-01.mcp.json /path/to/agent-01/.mcp.json`);
  console.log(`\nTo fund all wallets with SOL + USDC:`);
  console.log(`  node scripts/provision-agents.cjs ${numAgents} --fund`);

  // Print table
  console.log(`\n| Agent | Wallet | Config |`);
  console.log(`|-------|--------|--------|`);
  for (const a of agents) {
    console.log(`| ${a.name} | ${a.publicKey.slice(0, 8)}...${a.publicKey.slice(-4)} | ${a.name}.mcp.json |`);
  }
  console.log();
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
