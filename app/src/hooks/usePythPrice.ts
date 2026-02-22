import { useState, useEffect, useCallback } from "react";
import { fetchSolPrice, pythPriceToUsd, type PythPrice } from "../utils/pyth";

export function usePythPrice(intervalMs = 5000) {
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);
  const [raw, setRaw] = useState<PythPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const p = await fetchSolPrice();
      setRaw(p);
      setSolPriceUsd(pythPriceToUsd(p));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { solPriceUsd, raw, loading, error, refresh };
}
