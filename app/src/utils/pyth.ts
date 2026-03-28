export const HERMES_URL = "https://hermes.pyth.network";
export const SOL_USD_FEED_ID =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

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
  const data = await resp.json();
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
  // Convert to PRICE_PRECISION (1e9) using pure BigInt to avoid float precision loss.
  // p.price is an integer, p.expo is typically negative (e.g. -8).
  // Desired scale: 1e9, so exponent shift = 9 + expo (e.g. 9 + (-8) = 1).
  const exp = 9 + p.expo;
  const price = BigInt(p.price);
  if (exp >= 0) {
    return price * (10n ** BigInt(exp));
  } else {
    return price / (10n ** BigInt(-exp));
  }
}
