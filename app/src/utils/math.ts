import BN from "bn.js";

export const PRICE_PRECISION = new BN(1_000_000_000);
export const BPS_DENOMINATOR = new BN(10_000);
export const USDC_DECIMALS = 6;
export const SHORTSOL_DECIMALS = 9;
const DECIMAL_SCALING = new BN(1000); // 10^(9-6)

/** Calculate dynamic fee based on vault health ratio */
export function calcDynamicFee(
  baseFee: BN,
  vaultBalance: BN,
  circulating: BN,
  k: BN,
  solPrice: BN
): BN {
  if (circulating.isZero() || solPrice.isZero()) return baseFee;
  const shortsolPrice = k.mul(PRICE_PRECISION).div(solPrice);
  const obligations = circulating
    .mul(shortsolPrice)
    .div(PRICE_PRECISION)
    .div(DECIMAL_SCALING);
  if (obligations.isZero()) return baseFee;
  const ratioBps = vaultBalance.mul(BPS_DENOMINATOR).div(obligations);
  const ratio = ratioBps.toNumber();
  let fee: number;
  if (ratio > 20_000) {
    fee = Math.floor(baseFee.toNumber() / 2);
  } else if (ratio > 15_000) {
    fee = baseFee.toNumber() * 5;
  } else if (ratio > 10_000) {
    fee = baseFee.toNumber() * 10;
  } else {
    fee = baseFee.toNumber() * 20;
  }
  return new BN(Math.max(Math.min(fee, 100), 1));
}

export function calcShortsolPrice(k: BN, solPrice: BN): BN {
  // shortSOL_price = k * PRICE_PRECISION / sol_price
  return k.mul(PRICE_PRECISION).div(solPrice);
}

export function calcMintTokens(
  usdcAmount: BN,
  shortsolPrice: BN,
  feeBps: BN
): { tokens: BN; fee: BN } {
  const fee = usdcAmount.mul(feeBps).div(BPS_DENOMINATOR);
  const effective = usdcAmount.sub(fee);
  const tokens = effective
    .mul(DECIMAL_SCALING)
    .mul(PRICE_PRECISION)
    .div(shortsolPrice);
  return { tokens, fee };
}

export function calcRedeemUsdc(
  shortsolAmount: BN,
  shortsolPrice: BN,
  feeBps: BN
): { usdcOut: BN; fee: BN } {
  const grossUsdc = shortsolAmount
    .mul(shortsolPrice)
    .div(PRICE_PRECISION)
    .div(DECIMAL_SCALING);
  const fee = grossUsdc.mul(feeBps).div(BPS_DENOMINATOR);
  const usdcOut = grossUsdc.sub(fee);
  return { usdcOut, fee };
}

export function calcHolgingPnl(priceMultiplier: number): number {
  // 50% SOL + 50% shortSOL
  // v = 0.5 * (x + 1/x), pnl = v - 1
  const v = 0.5 * (priceMultiplier + 1 / priceMultiplier);
  return v - 1;
}

export function formatUsdc(lamports: BN): string {
  const raw = lamports.toString();
  const padded = raw.padStart(USDC_DECIMALS + 1, "0");
  const intPart = padded.slice(0, -USDC_DECIMALS);
  const fracPart = padded.slice(-USDC_DECIMALS, -USDC_DECIMALS + 2);
  return `$${intPart}.${fracPart}`;
}

export function formatShortsolAmount(lamports: BN): string {
  const raw = lamports.toString();
  const padded = raw.padStart(SHORTSOL_DECIMALS + 1, "0");
  const intPart = padded.slice(0, -SHORTSOL_DECIMALS);
  const fracPart = padded.slice(-SHORTSOL_DECIMALS, -SHORTSOL_DECIMALS + 4);
  return `${intPart}.${fracPart}`;
}

export function formatPrice(priceWithPrecision: BN): string {
  const raw = priceWithPrecision.toString();
  const padded = raw.padStart(10, "0");
  const intPart = padded.slice(0, -9);
  const fracPart = padded.slice(-9, -7);
  return `$${intPart}.${fracPart}`;
}

export function usdcToLamports(amount: number): BN {
  return new BN(Math.round(amount * 10 ** USDC_DECIMALS));
}

export function shortsolToLamports(amount: number): BN {
  return new BN(Math.round(amount * 10 ** SHORTSOL_DECIMALS));
}

// --- Risk & Liquidity calculations ---

export function calcRequiredLiquidity(tvl: number, maxDrop: number): number {
  return tvl / (1 - maxDrop);
}

export function calcLiquidityGap(
  tvl: number,
  maxDrop: number,
  fee: number
): number {
  return tvl * (maxDrop / (1 - maxDrop) - fee);
}

export function calcDailyFeeBuffer(
  dailyVolume: number,
  fee: number
): number {
  return dailyVolume * 2 * fee;
}

export function calcDaysToSelfFund(
  gap: number,
  dailyBuffer: number
): number {
  return dailyBuffer > 0 ? gap / dailyBuffer : Infinity;
}

export function calcRequiredVolume(
  tvl: number,
  maxDrop: number,
  fee: number,
  days: number
): number {
  return (tvl * maxDrop) / ((1 - maxDrop) * 2 * fee * days);
}

// --- Strategy Terminal calculations ---

export function calcHolgingPnlWithFees(
  priceMultiplier: number,
  feeBps: number
): number {
  const grossPnl = calcHolgingPnl(priceMultiplier);
  const roundtripFee = (2 * feeBps) / 10_000;
  return grossPnl - roundtripFee;
}

export function calcHolgingGreeks(priceMultiplier: number): {
  delta: number;
  gamma: number;
} {
  const x = priceMultiplier;
  if (x <= 0) return { delta: 0, gamma: 0 };
  const delta = 0.5 * (1 - 1 / (x * x));
  const gamma = 1 / (x * x * x);
  return { delta, gamma };
}

export function calcBreakeven(feeBps: number): {
  lower: number;
  upper: number;
} {
  const c = (2 * feeBps) / 10_000;
  const b = 2 * (1 + c);
  const disc = Math.sqrt(b * b - 4);
  const lower = (b - disc) / 2;
  const upper = (b + disc) / 2;
  return { lower, upper };
}

export function generateChartPoints(
  steps: number,
  feeBps: number
): Array<{ x: number; pnl: number; pnlWithFees: number }> {
  const points: Array<{ x: number; pnl: number; pnlWithFees: number }> = [];
  const xMin = 0.1;
  const xMax = 3.0;
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (xMax - xMin) * (i / steps);
    points.push({
      x,
      pnl: calcHolgingPnl(x),
      pnlWithFees: calcHolgingPnlWithFees(x, feeBps),
    });
  }
  return points;
}

// --- AMM Pool Simulator ---

// IL for SOL/shortSOL pool when SOL moves by factor x (e.g. 1.1 = +10%)
// hold value = (x + 1/x)/2, pool value = 1 (constant)
// IL = 1 - 2/(x + 1/x)
export function calcAmmIL(priceMultiplier: number): number {
  if (priceMultiplier <= 0) return 0;
  const holdValue = (priceMultiplier + 1 / priceMultiplier) / 2;
  return 1 - 1 / holdValue;
}

// Daily IL given pool size and daily volatility σ (as decimal, e.g. 0.03 = 3%)
// For anti-correlated assets: IL_daily ≈ poolSize × σ²/2
export function calcDailyIL(poolSize: number, dailyVol: number): number {
  return poolSize * (dailyVol * dailyVol) / 2;
}

// Expected daily arb volume: V ≈ poolSize × σ
export function calcArbVolume(poolSize: number, dailyVol: number): number {
  return poolSize * dailyVol;
}

// AMM LP fee revenue from arb volume
export function calcAmmFeeRevenue(arbVolume: number, ammFee: number): number {
  return arbVolume * ammFee;
}

// Protocol fee revenue from arb (each arb = mint or redeem)
export function calcProtocolFeeRevenue(
  arbVolume: number,
  protocolFee: number
): number {
  return arbVolume * protocolFee;
}

// Break-even AMM fee: fee where LP revenue = IL
// fee_breakeven = σ / 2
export function calcBreakevenAmmFee(dailyVol: number): number {
  return dailyVol / 2;
}
