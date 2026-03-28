import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _program: anchor.Program | null = null;
let _connection: Connection | null = null;
let _wallet: anchor.Wallet | null = null;
let _usdcMint: PublicKey | null = null;

export function getUsdcMint(): PublicKey {
  if (!_usdcMint) {
    _usdcMint = new PublicKey(
      process.env.USDC_MINT || "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn"
    );
  }
  return _usdcMint;
}

export function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
    _connection = new Connection(rpcUrl, "confirmed");
  }
  return _connection;
}

export function getWallet(): anchor.Wallet {
  if (!_wallet) {
    const walletPath =
      process.env.ANCHOR_WALLET || `${process.env.HOME}/solana-wallet.json`;
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet not found: ${walletPath}`);
    }
    const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
    _wallet = new anchor.Wallet(keypair);
  }
  return _wallet;
}

export function getProgram(): anchor.Program {
  if (!_program) {
    const connection = getConnection();
    const wallet = getWallet();
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    anchor.setProvider(provider);

    // Try multiple IDL paths
    const idlPaths = [
      path.resolve(__dirname, "../../target/idl/holging.json"),
      path.resolve(__dirname, "../idl/holging.json"),
    ];

    let idl: any = null;
    for (const p of idlPaths) {
      if (fs.existsSync(p)) {
        idl = JSON.parse(fs.readFileSync(p, "utf-8"));
        break;
      }
    }

    if (!idl) {
      throw new Error(`IDL not found. Tried: ${idlPaths.join(", ")}`);
    }

    _program = new anchor.Program(idl, provider);
  }
  return _program;
}
