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
const FUNDING_SEED = Buffer.from("funding");
const LP_MINT_SEED = Buffer.from("lp_mint");
const LP_POSITION_SEED = Buffer.from("lp_position");

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

export function deriveFundingConfigPda(): [PublicKey, number] {
  const [poolPda] = derivePoolPda();
  return PublicKey.findProgramAddressSync(
    [FUNDING_SEED, poolPda.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveLpMintPda(): [PublicKey, number] {
  const [poolPda] = derivePoolPda();
  return PublicKey.findProgramAddressSync(
    [LP_MINT_SEED, poolPda.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveLpPositionPda(lpProvider: PublicKey): [PublicKey, number] {
  const [poolPda] = derivePoolPda();
  return PublicKey.findProgramAddressSync(
    [LP_POSITION_SEED, poolPda.toBuffer(), lpProvider.toBuffer()],
    PROGRAM_ID
  );
}
