import { usePythPrice } from "../hooks/usePythPrice";
import { usePool } from "../hooks/usePool";
import { useFundingConfig } from "../hooks/useFundingConfig";
import { POOLS, DEFAULT_POOL_ID } from "../config/pools";
import BN from "bn.js";
import { calcShortsolPrice, calcDynamicFee, calcAdaptiveRate, formatPrice } from "../utils/math";

export function PriceDisplay({ poolId = DEFAULT_POOL_ID }: { poolId?: string }) {
  const { solPriceUsd, loading: priceLoading, error: priceError } = usePythPrice(POOLS[poolId]?.feedId);
  const { pool, loading: poolLoading } = usePool(poolId);
  const { config: fundingConfig } = useFundingConfig(poolId);

  const shortsolPriceUsd =
    pool && solPriceUsd
      ? (() => {
          const solPriceBn = new BN(Math.round(solPriceUsd * 1e9));
          const ssPrice = calcShortsolPrice(pool.k, solPriceBn);
          return formatPrice(ssPrice);
        })()
      : null;

  const dynamicFeeBps =
    pool && solPriceUsd
      ? (() => {
          const solPriceBn = new BN(Math.round(solPriceUsd * 1e9));
          const fee = calcDynamicFee(
            new BN(pool.feeBps),
            new BN(pool.vaultBalance),
            new BN(pool.circulating),
            pool.k,
            solPriceBn
          );
          return fee.toNumber();
        })()
      : pool?.feeBps ?? 0;

  const adaptiveRate =
    pool && solPriceUsd && fundingConfig
      ? (() => {
          const solPriceBn = new BN(Math.round(solPriceUsd * 1e9));
          return calcAdaptiveRate(
            fundingConfig.rateBps,
            new BN(pool.vaultBalance),
            new BN(pool.circulating),
            pool.k,
            solPriceBn
          );
        })()
      : null;

  return (
    <div className="price-display">
      <div className="price-card">
        <span className="price-label">{POOLS[poolId]?.asset ?? "SOL"}/USD</span>
        <span className="price-value">
          {priceLoading
            ? "Loading..."
            : priceError
            ? "Error"
            : `$${solPriceUsd?.toFixed(2)}`}
        </span>
      </div>
      <div className="price-card">
        <span className="price-label">{POOLS[poolId]?.name ?? "shortSOL"}</span>
        <span className="price-value">
          {poolLoading ? "Loading..." : shortsolPriceUsd ?? "—"}
        </span>
      </div>
      {pool && (
        <div className="price-card">
          <span className="price-label">Fee</span>
          <span className="price-value">{(dynamicFeeBps / 100).toFixed(2)}%</span>
        </div>
      )}
      {adaptiveRate && (
        <div className="price-card">
          <span className="price-label">Rate</span>
          <span className="price-value">{adaptiveRate.effectiveRateBps} bps/day ({adaptiveRate.tierLabel})</span>
        </div>
      )}
    </div>
  );
}
