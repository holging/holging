import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const PROGRAM_ID = new PublicKey("CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX");
export const DEFAULT_POOL_ID = "sol";
export const HERMES_URL = "https://hermes.pyth.network";
export const PRICE_PRECISION = new BN(1_000_000_000);
export const BPS_DENOMINATOR = new BN(10_000);

export const POOLS: Record<string, { feedId: string; name: string }> = {
  sol:  { feedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", name: "shortSOL" },
  tsla: { feedId: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1", name: "shortTSLA" },
  spy:  { feedId: "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5", name: "shortSPY" },
  aapl: { feedId: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688", name: "shortAAPL" },
};

const POOL_SEED = Buffer.from("pool");
const VAULT_SEED = Buffer.from("vault");
const MINT_AUTH_SEED = Buffer.from("mint_auth");
const SHORTSOL_MINT_SEED = Buffer.from("shortsol_mint");
const FUNDING_SEED = Buffer.from("funding");
const LP_MINT_SEED = Buffer.from("lp_mint");
const LP_POSITION_SEED = Buffer.from("lp_position");

export function getFeedId(poolId: string = DEFAULT_POOL_ID): string {
  return POOLS[poolId]?.feedId ?? POOLS[DEFAULT_POOL_ID].feedId;
}

export function derivePoolPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([POOL_SEED, Buffer.from(poolId)], PROGRAM_ID);
}

export function deriveShortsolMintPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SHORTSOL_MINT_SEED, Buffer.from(poolId)], PROGRAM_ID);
}

export function deriveMintAuthPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MINT_AUTH_SEED, Buffer.from(poolId)], PROGRAM_ID);
}

export function deriveVaultPda(usdcMint: PublicKey, poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, usdcMint.toBuffer(), Buffer.from(poolId)], PROGRAM_ID);
}

export function deriveFundingConfigPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  const [poolPda] = derivePoolPda(poolId);
  return PublicKey.findProgramAddressSync([FUNDING_SEED, poolPda.toBuffer()], PROGRAM_ID);
}

export function deriveLpMintPda(poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  const [poolPda] = derivePoolPda(poolId);
  return PublicKey.findProgramAddressSync([LP_MINT_SEED, poolPda.toBuffer()], PROGRAM_ID);
}

export function deriveLpPositionPda(lpProvider: PublicKey, poolId: string = DEFAULT_POOL_ID): [PublicKey, number] {
  const [poolPda] = derivePoolPda(poolId);
  return PublicKey.findProgramAddressSync([LP_POSITION_SEED, poolPda.toBuffer(), lpProvider.toBuffer()], PROGRAM_ID);
}

export interface PythPrice {
  price: number;
  conf: number;
  expo: number;
  publishTime: number;
}

export async function fetchSolPrice(poolId: string = DEFAULT_POOL_ID): Promise<PythPrice> {
  const feedId = getFeedId(poolId);
  const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${feedId}&parsed=true`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Pyth API error: ${resp.status}`);
  const data: any = await resp.json();
  const parsed = data.parsed?.[0]?.price;
  if (!parsed) throw new Error("No price data for feed");
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

export async function fetchPriceUpdateData(poolId: string = DEFAULT_POOL_ID): Promise<string[]> {
  const feedId = getFeedId(poolId);
  const resp = await fetch(
    `${HERMES_URL}/v2/updates/price/latest?ids[]=${feedId}&encoding=base64`
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
