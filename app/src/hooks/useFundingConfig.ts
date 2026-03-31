import { useState, useEffect, useCallback } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { getProgram, getReadOnlyProgram, deriveFundingConfigPda } from "../utils/program";
import { DEFAULT_POOL_ID } from "../config/pools";

export interface FundingConfigState {
  rateBps: number;
  lastFundingAt: number;
}

export function useFundingConfig(poolId: string = DEFAULT_POOL_ID, intervalMs = 15_000) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [config, setConfig] = useState<FundingConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const program = wallet
        ? getProgram(connection, wallet)
        : getReadOnlyProgram(connection);
      const [fundingPda] = deriveFundingConfigPda(poolId);
      const account = await (program.account as any).fundingConfig.fetch(fundingPda);
      setConfig({
        rateBps: account.rateBps,
        lastFundingAt: Number(account.lastFundingAt),
      });
      setError(null);
    } catch (e: any) {
      // FundingConfig may not exist yet — that's fine, not a hard error
      setError(e.message);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [connection, wallet, poolId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { config, loading, error, refresh };
}
