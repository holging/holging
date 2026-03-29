import { usePythPrice } from "../hooks/usePythPrice";
import { usePool } from "../hooks/usePool";
import { POOLS, DEFAULT_POOL_ID } from "../config/pools";
import BN from "bn.js";
import { calcShortsolPrice, formatPrice } from "../utils/math";

export function PriceDisplay({ poolId = DEFAULT_POOL_ID }: { poolId?: string }) {
  const { solPriceUsd, loading: priceLoading, error: priceError } = usePythPrice(POOLS[poolId]?.feedId);
  const { pool, loading: poolLoading } = usePool(poolId);

  const shortsolPriceUsd =
    pool && solPriceUsd
      ? (() => {
          const solPriceBn = new BN(Math.round(solPriceUsd * 1e9));
          const ssPrice = calcShortsolPrice(pool.k, solPriceBn);
          return formatPrice(ssPrice);
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
          <span className="price-value">{pool.feeBps / 100}%</span>
        </div>
      )}
    </div>
  );
}
