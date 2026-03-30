/**
 * Standalone Pyth price poster — called by MCP server as subprocess.
 * Lives in app/ to reuse its node_modules (pyth-solana-receiver + jito-ts).
 *
 * Usage: node scripts/post-pyth-price.cjs <poolId>
 * Output: prints the priceUpdateAccount pubkey on last line.
 */
const { PythSolanaReceiver } = require("@pythnetwork/pyth-solana-receiver");
const { Connection, Keypair } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const fs = require("fs");

const FEEDS = {
  sol:  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  tsla: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  spy:  "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
  aapl: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
};

async function main() {
  const poolId = process.argv[2] || "sol";
  const feedId = FEEDS[poolId] || FEEDS["sol"];
  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET || (process.env.HOME + "/solana-wallet.json");

  const conn = new Connection(rpcUrl, "confirmed");
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const kp = Keypair.fromSecretKey(Uint8Array.from(rawKey));
  const wallet = new anchor.Wallet(kp);

  // Fetch fresh price VAA from Hermes
  const resp = await fetch(
    `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}&encoding=base64`
  );
  if (!resp.ok) throw new Error(`Hermes API error: ${resp.status}`);
  const data = await resp.json();

  const pythReceiver = new PythSolanaReceiver({ connection: conn, wallet });
  const txBuilder = pythReceiver.newTransactionBuilder({ closeUpdateAccounts: false });
  await txBuilder.addPostPriceUpdates(data.binary.data);

  let priceUpdateAccount;
  await txBuilder.addPriceConsumerInstructions(async (get) => {
    try { priceUpdateAccount = get("0x" + feedId); }
    catch { priceUpdateAccount = get(feedId); }
    return [];
  });

  const txs = await txBuilder.buildVersionedTransactions({ tightComputeBudget: false });

  for (const entry of txs) {
    const vtx = entry.tx || entry;
    const signers = entry.signers || [];
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    vtx.message.recentBlockhash = blockhash;
    if (signers.length > 0) vtx.sign(signers);
    const signed = await wallet.signTransaction(vtx);
    const sig = await conn.sendTransaction(signed);
    await conn.confirmTransaction(sig, "confirmed");
  }

  // Output the account pubkey (MCP server reads last line)
  console.log(priceUpdateAccount.toBase58());
}

main().catch((e) => {
  console.error("PYTH_POSTER_ERROR:", e.message);
  process.exit(1);
});
