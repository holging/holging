import { usePythPrice } from "../hooks/usePythPrice";
import { usePool } from "../hooks/usePool";
import BN from "bn.js";
import { calcShortsolPrice, formatPrice } from "../utils/math";

export function PriceDisplay() {
  const { solPriceUsd, loading: priceLoading, error: priceError } = usePythPrice();
  const { pool, loading: poolLoading } = usePool();

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
        <span className="price-label">SOL/USD</span>
        <span className="price-value">
          {priceLoading
            ? "Loading..."
            : priceError
            ? "Error"
            : `$${solPriceUsd?.toFixed(2)}`}
        </span>
      </div>
      <div className="price-card">
        <span className="price-label">shortSOL</span>
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
