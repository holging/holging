import { useState, useEffect, useCallback } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { getProgram, derivePoolPda } from "../utils/program";
import BN from "bn.js";

export interface PoolState {
  authority: string;
  k: BN;
  feeBps: number;
  totalMinted: BN;
  totalRedeemed: BN;
  circulating: BN;
  totalFeesCollected: BN;
  vaultBalance: BN;
  pythFeed: string;
  shortsolMint: string;
  paused: boolean;
  lastOraclePrice: BN;
  lastOracleTimestamp: BN;
  bump: number;
  mintAuthBump: number;
  // LP system fields (present after initialize_lp)
  lpMint: string;
  lpTotalSupply: BN;
  feePerShareAccumulated: BN;
  lpPrincipal: BN;
  minLpDeposit: BN;
  totalLpFeesPending: BN;
}

export function usePool(intervalMs = 15_000) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [pool, setPool] = useState<PoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }
    try {
      const program = getProgram(connection, wallet);
      const [poolPda] = derivePoolPda();
      const account = await (program.account as any).poolState.fetch(poolPda);
      setPool({
        authority: account.authority.toBase58(),
        k: account.k,
        feeBps: account.feeBps,
        totalMinted: account.totalMinted,
        totalRedeemed: account.totalRedeemed,
        circulating: account.circulating,
        totalFeesCollected: account.totalFeesCollected,
        vaultBalance: account.vaultBalance,
        pythFeed: account.pythFeed.toBase58(),
        shortsolMint: account.shortsolMint.toBase58(),
        paused: account.paused,
        lastOraclePrice: account.lastOraclePrice,
        lastOracleTimestamp: account.lastOracleTimestamp,
        bump: account.bump,
        mintAuthBump: account.mintAuthBump,
        // LP fields — may be absent on older pool state
        lpMint: account.lpMint ? account.lpMint.toBase58() : "",
        lpTotalSupply: account.lpTotalSupply ?? new BN(0),
        feePerShareAccumulated: account.feePerShareAccumulated ?? new BN(0),
        lpPrincipal: account.lpPrincipal ?? new BN(0),
        minLpDeposit: account.minLpDeposit ?? new BN(0),
        totalLpFeesPending: account.totalLpFeesPending ?? new BN(0),
      });
      setError(null);
    } catch (e: any) {
      setError(e.message);
      setPool(null);
    } finally {
      setLoading(false);
    }
  }, [connection, wallet]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { pool, loading, error, refresh };
}
