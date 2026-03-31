import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const PROGRAM_ID = new PublicKey("CLmSD9eax2JmhJQdiU3RYt82fgjb78nCdZLaeDZQvTVX");
export const DEFAULT_POOL_ID = "sol";
export const HERMES_URL = "https://hermes.pyth.network";
export const PRICE_PRECISION = new BN(1_000_000_000);
export const BPS_DENOMINATOR = new BN(10_000);

export const POOLS: Record<string, { feedId: string; name: string; asset: string }> = {
  sol:  { feedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", name: "shortSOL", asset: "SOL" },
  tsla: { feedId: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1", name: "shortTSLA", asset: "TSLA" },
  spy:  { feedId: "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5", name: "shortSPY", asset: "SPY" },
  aapl: { feedId: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688", name: "shortAAPL", asset: "AAPL" },
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

export function getPoolName(poolId: string = DEFAULT_POOL_ID): string {
  return POOLS[poolId]?.name ?? poolId;
}

export function getAssetName(poolId: string = DEFAULT_POOL_ID): string {
  return POOLS[poolId]?.asset ?? poolId.toUpperCase();
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

// ─── Pyth helpers ────────────────────────────────────────────────────────────

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

export async function fetchPriceUpdateData(poolId: string = DEFAULT_POOL_ID): Promise<string[]> {
  const feedId = getFeedId(poolId);
  const resp = await fetch(
    `${HERMES_URL}/v2/updates/price/latest?ids[]=${feedId}&encoding=base64`
  );
  if (!resp.ok) throw new Error(`Hermes API error: ${resp.status}`);
  const data: any = await resp.json();
  return data.binary.data;
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

// ─── Math helpers ────────────────────────────────────────────────────────────

export function formatUsdc(lamports: BN | number): string {
  const val = typeof lamports === "number" ? lamports : lamports.toNumber();
  return `$${(val / 1e6).toFixed(2)}`;
}

export function calcShortsolPrice(k: BN, solPrice: BN): BN {
  return k.mul(PRICE_PRECISION).div(solPrice);
}

export function calcDynamicFee(
  baseFee: BN,
  vaultBalance: BN,
  circulating: BN,
  k: BN,
  solPrice: BN,
): BN {
  if (circulating.isZero() || solPrice.isZero()) {
    // No tokens in circulation — apply minimum tier (×5)
    return new BN(Math.max(Math.min(baseFee.toNumber() * 5, 100), 1));
  }
  const shortsolPrice = calcShortsolPrice(k, solPrice);
  const obligations = circulating.mul(shortsolPrice).div(PRICE_PRECISION);
  const obligationsUsdc = obligations.div(new BN(1000)); // 1e9 → 1e6
  if (obligationsUsdc.isZero()) {
    return new BN(Math.max(Math.min(baseFee.toNumber() * 5, 100), 1));
  }
  const ratioBps = vaultBalance.mul(BPS_DENOMINATOR).div(obligationsUsdc);
  const ratio = ratioBps.toNumber();

  let fee: number;
  if (ratio > 20_000) {
    // > 200% — vault very healthy
    fee = baseFee.toNumber() * 5;
  } else if (ratio > 15_000) {
    // 150-200% — normal
    fee = baseFee.toNumber() * 10;
  } else if (ratio > 10_000) {
    // 100-150% — elevated
    fee = baseFee.toNumber() * 15;
  } else {
    // < 100% — critical
    fee = baseFee.toNumber() * 20;
  }

  // Clamp to max 100 bps (1%), min 1 bps
  return new BN(Math.max(Math.min(fee, 100), 1));
}

export function calcMintTokens(
  usdcAmount: BN,
  shortsolPrice: BN,
  feeBps: BN,
): { tokens: BN; fee: BN } {
  const fee = usdcAmount.mul(feeBps).div(BPS_DENOMINATOR);
  const net = usdcAmount.sub(fee);
  const netScaled = net.mul(new BN(1000)); // 1e6 → 1e9
  const tokens = netScaled.mul(PRICE_PRECISION).div(shortsolPrice);
  return { tokens, fee };
}

export function calcRedeemUsdc(
  tokenAmount: BN,
  shortsolPrice: BN,
  feeBps: BN,
): { usdcOut: BN; fee: BN } {
  const gross = tokenAmount.mul(shortsolPrice).div(PRICE_PRECISION);
  const grossUsdc = gross.div(new BN(1000)); // 1e9 → 1e6
  const fee = grossUsdc.mul(feeBps).div(BPS_DENOMINATOR);
  const usdcOut = grossUsdc.sub(fee);
  return { usdcOut, fee };
}

const MAX_FUNDING_RATE_BPS = 100;

/**
 * Mirrors on-chain calc_adaptive_rate (programs/holging/src/fees.rs:88-125).
 * Vault health ratio determines the multiplier applied to the base funding rate:
 *   > 200% → ×0.5 (healthy)
 *   150-200% → ×1 (normal)
 *   100-150% → ×2 (elevated)
 *   < 100% → ×3 (critical)
 * Result clamped to MAX_FUNDING_RATE_BPS (100 bps = 1%).
 */
export function calcAdaptiveRate(
  baseRateBps: number,
  vaultBalance: BN,
  circulating: BN,
  k: BN,
  solPrice: BN,
): { effectiveRateBps: number; tierLabel: string } {
  if (circulating.isZero() || solPrice.isZero()) {
    return { effectiveRateBps: baseRateBps, tierLabel: "Normal" };
  }

  const shortsolPrice = calcShortsolPrice(k, solPrice);
  const obligations = circulating.mul(shortsolPrice).div(PRICE_PRECISION);
  const obligationsUsdc = obligations.div(new BN(1000)); // 1e9 → 1e6

  if (obligationsUsdc.isZero()) {
    return { effectiveRateBps: baseRateBps, tierLabel: "Normal" };
  }

  const ratioBps = vaultBalance.mul(BPS_DENOMINATOR).div(obligationsUsdc);
  const ratio = ratioBps.toNumber();

  let effective: number;
  let tierLabel: string;

  if (ratio > 20_000) {
    // > 200% — vault very healthy
    effective = Math.floor(baseRateBps / 2);
    tierLabel = "Healthy";
  } else if (ratio > 15_000) {
    // 150-200% — normal
    effective = baseRateBps;
    tierLabel = "Normal";
  } else if (ratio > 10_000) {
    // 100-150% — elevated
    effective = baseRateBps * 2;
    tierLabel = "Elevated";
  } else {
    // < 100% — critical
    effective = baseRateBps * 3;
    tierLabel = "Critical";
  }

  // Clamp to MAX_FUNDING_RATE_BPS
  effective = Math.min(effective, MAX_FUNDING_RATE_BPS);

  return { effectiveRateBps: effective, tierLabel };
}
