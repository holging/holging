/**
 * Create Metaplex metadata for fake USDC token on devnet.
 *
 * Usage:
 *   npx ts-node scripts/create-usdc-metadata.ts
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createMetadataAccountV3,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  publicKey,
  signerIdentity,
  createSignerFromKeypair,
} from "@metaplex-foundation/umi";
import * as fs from "fs";

const DEVNET_RPC = "https://api.devnet.solana.com";
const USDC_MINT = "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn";

async function main() {
  // Load wallet
  const walletPath =
    process.env.ANCHOR_WALLET || "${HOME}/solana-wallet.json";
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));

  // Create Umi instance
  const umi = createUmi(DEVNET_RPC);

  // Create signer from keypair
  const keypair = umi.eddsa.createKeypairFromSecretKey(
    Uint8Array.from(rawKey)
  );
  const signer = createSignerFromKeypair(umi, keypair);
  umi.use(signerIdentity(signer));

  const mint = publicKey(USDC_MINT);

  // Derive metadata PDA
  const metadataPda = findMetadataPda(umi, { mint });
  console.log("Mint:", USDC_MINT);
  console.log("Metadata PDA:", metadataPda[0]);
  console.log("Authority:", signer.publicKey);

  // Create metadata
  console.log("\nCreating metadata for fake USDC...");
  const tx = await createMetadataAccountV3(umi, {
    metadata: metadataPda,
    mint,
    mintAuthority: signer,
    payer: signer,
    updateAuthority: signer.publicKey,
    data: {
      name: "USD Coin (Devnet)",
      symbol: "USDC",
      uri: "",
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  }).sendAndConfirm(umi);

  console.log("TX signature:", Buffer.from(tx.signature).toString("base64"));
  console.log("\nMetadata created for fake USDC!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
