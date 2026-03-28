import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const PROGRAM_ID = new PublicKey("CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX");
export const POOL_ID = "sol";
export const HERMES_URL = "https://hermes.pyth.network";
export const SOL_USD_FEED_ID = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
export const PRICE_PRECISION = new BN(1_000_000_000);
export const BPS_DENOMINATOR = new BN(10_000);

const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const MINT_AUTH_SEED = Buffer.from("mint_auth");
const SHORTSOL_MINT_SEED = Buffer.from("shortsol_mint");
const FUNDING_SEED = Buffer.from("funding");
const LP_MINT_SEED = Buffer.from("lp_mint");
const LP_POSITION_SEED = Buffer.from("lp_position");

export function derivePoolPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([POOL_SEED, Buffer.from(POOL_ID)], PROGRAM_ID);
}

export function deriveShortsolMintPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SHORTSOL_MINT_SEED, Buffer.from(POOL_ID)], PROGRAM_ID);
}

export function deriveMintAuthPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MINT_AUTH_SEED, Buffer.from(POOL_ID)], PROGRAM_ID);
}

export function deriveVaultPda(usdcMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, usdcMint.toBuffer(), Buffer.from(POOL_ID)], PROGRAM_ID);
}

export function deriveFundingConfigPda(): [PublicKey, number] {
  const [poolPda] = derivePoolPda();
  return PublicKey.findProgramAddressSync([FUNDING_SEED, poolPda.toBuffer()], PROGRAM_ID);
}

export function deriveLpMintPda(): [PublicKey, number] {
  const [poolPda] = derivePoolPda();
  return PublicKey.findProgramAddressSync([LP_MINT_SEED, poolPda.toBuffer()], PROGRAM_ID);
}

export function deriveLpPositionPda(lpProvider: PublicKey): [PublicKey, number] {
  const [poolPda] = derivePoolPda();
  return PublicKey.findProgramAddressSync([LP_POSITION_SEED, poolPda.toBuffer(), lpProvider.toBuffer()], PROGRAM_ID);
}

export interface PythPrice {
  price: number;
  conf: number;
  expo: number;
  publishTime: number;
}

export async function fetchSolPrice(): Promise<PythPrice> {
  const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}&parsed=true`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Pyth API error: ${resp.status}`);
  const data: any = await resp.json();
  const parsed = data.parsed?.[0]?.price;
  if (!parsed) throw new Error("No SOL/USD price data");
  return {
    price: Number(parsed.price),
    conf: Number(parsed.conf),
    expo: Number(parsed.expo),
    publishTime: Number(parsed.publish_time),
  };
}

export function pythPriceToUsd(p: PythPrice): number {
  return p.price * 10 ** p.expo;
}

export function pythPriceToPrecision(p: PythPrice): bigint {
  const exp = 9 + p.expo;
  const price = BigInt(p.price);
  if (exp >= 0) return price * (10n ** BigInt(exp));
  return price / (10n ** BigInt(-exp));
}

export async function fetchPriceUpdateData(): Promise<string[]> {
  const resp = await fetch(
    `${HERMES_URL}/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}&encoding=base64`
  );
  if (!resp.ok) throw new Error(`Hermes API error: ${resp.status}`);
  const data: any = await resp.json();
  return data.binary.data;
}

export function formatUsdc(lamports: BN | number): string {
  const val = typeof lamports === "number" ? lamports : lamports.toNumber();
  return `$${(val / 1e6).toFixed(2)}`;
}

export function calcShortsolPrice(k: BN, solPrice: BN): BN {
  return k.mul(PRICE_PRECISION).div(solPrice);
}
