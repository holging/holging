import { useState, useEffect, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AccountLayout } from "@solana/spl-token";
import { deriveShortsolMintPda } from "../utils/program";
import { SHORTSOL_DECIMALS } from "../utils/math";
import { DEFAULT_POOL_ID } from "../config/pools";

export interface TokenHolder {
  address: string;
  balance: number;
  percentage: number;
}

export function useTokenHolders(poolId: string = DEFAULT_POOL_ID, intervalMs = 30_000) {
  const { connection } = useConnection();
  const [holders, setHolders] = useState<TokenHolder[]>([]);
  const [totalSupply, setTotalSupply] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [shortsolMint] = deriveShortsolMintPda(poolId);

      // Fetch supply and largest accounts in parallel
      const [supplyRes, largestRes] = await Promise.all([
        connection.getTokenSupply(shortsolMint),
        connection.getTokenLargestAccounts(shortsolMint),
      ]);

      const supply =
        Number(supplyRes.value.amount) / 10 ** SHORTSOL_DECIMALS;
      setTotalSupply(supply);

      // Get owner for each token account
      const nonZero = largestRes.value.filter(
        (a) => Number(a.amount) > 0
      );

      const accountInfos = await connection.getMultipleAccountsInfo(
        nonZero.map((a) => a.address)
      );

      const parsed: TokenHolder[] = [];
      for (let i = 0; i < nonZero.length; i++) {
        const info = accountInfos[i];
        if (!info) continue;

        const decoded = AccountLayout.decode(info.data);
        const owner = new PublicKey(decoded.owner).toBase58();
        const balance =
          Number(nonZero[i].amount) / 10 ** SHORTSOL_DECIMALS;
        const percentage = supply > 0 ? (balance / supply) * 100 : 0;

        parsed.push({ address: owner, balance, percentage });
      }

      parsed.sort((a, b) => b.balance - a.balance);
      setHolders(parsed);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, poolId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { holders, totalSupply, loading, error, refresh };
}
