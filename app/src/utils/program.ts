import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import IDL from "../idl/solshort.json";
import { DEFAULT_POOL_ID } from "../config/pools";

export const PROGRAM_ID = new PublicKey(IDL.address);

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

/** Read-only program instance — no wallet required */
export function getReadOnlyProgram(connection: Connection) {
  const provider = new AnchorProvider(
    connection,
    // Dummy wallet for read-only operations
    {
      publicKey: PublicKey.default,
      signTransaction: () => Promise.reject(new Error("Read-only")),
      signAllTransactions: () => Promise.reject(new Error("Read-only")),
    } as any,
    { commitment: "confirmed" },
  );
  return new Program(IDL as any, provider);
}

export function derivePoolPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POOL_SEED, Buffer.from(poolId)],
    PROGRAM_ID
  );
}

export function deriveShortsolMintPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SHORTSOL_MINT_SEED, Buffer.from(poolId)],
    PROGRAM_ID
  );
}

export function deriveMintAuthPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINT_AUTH_SEED, Buffer.from(poolId)],
    PROGRAM_ID
  );
}

export function deriveVaultPda(usdcMint: PublicKey, poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, usdcMint.toBuffer(), Buffer.from(poolId)],
    PROGRAM_ID
  );
}

export function deriveFundingConfigPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  const [poolPda] = derivePoolPda(poolId);
  return PublicKey.findProgramAddressSync(
    [FUNDING_SEED, poolPda.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveLpMintPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  const [poolPda] = derivePoolPda(poolId);
  return PublicKey.findProgramAddressSync(
    [LP_MINT_SEED, poolPda.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveLpPositionPda(lpProvider: PublicKey, poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  const [poolPda] = derivePoolPda(poolId);
  return PublicKey.findProgramAddressSync(
    [LP_POSITION_SEED, poolPda.toBuffer(), lpProvider.toBuffer()],
    PROGRAM_ID
  );
}
