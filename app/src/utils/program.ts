import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import IDL from "../idl/solshort.json";

export const PROGRAM_ID = new PublicKey(IDL.address);

export const POOL_ID = "sol";
const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const MINT_AUTH_SEED = Buffer.from("mint_auth");
const SHORTSOL_MINT_SEED = Buffer.from("shortsol_mint");

export const DEVNET_RPC = "https://api.devnet.solana.com";

export function getProvider(connection: Connection, wallet: AnchorWallet) {
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

export function getProgram(connection: Connection, wallet: AnchorWallet) {
  const provider = getProvider(connection, wallet);
  return new Program(IDL as any, provider);
}

export function derivePoolPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POOL_SEED, Buffer.from(POOL_ID)],
    PROGRAM_ID
  );
}

export function deriveShortsolMintPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SHORTSOL_MINT_SEED, Buffer.from(POOL_ID)],
    PROGRAM_ID
  );
}

export function deriveMintAuthPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINT_AUTH_SEED, Buffer.from(POOL_ID)],
    PROGRAM_ID
  );
}

export function deriveVaultPda(usdcMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, usdcMint.toBuffer(), Buffer.from(POOL_ID)],
    PROGRAM_ID
  );
}
