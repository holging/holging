import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { deriveShortsolMintPda } from "../utils/program";
import { usePool } from "../hooks/usePool";
import { usePythPrice } from "../hooks/usePythPrice";
import { POOLS, DEFAULT_POOL_ID } from "../config/pools";
import {
  calcShortsolPrice,
  SHORTSOL_DECIMALS,
  USDC_DECIMALS,
} from "../utils/math";
import BN from "bn.js";

export function PositionCard({ poolId = DEFAULT_POOL_ID }: { poolId?: string }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { pool } = usePool(poolId);
  const { solPriceUsd } = usePythPrice(POOLS[poolId]?.feedId);
  const [shortsolBalance, setShortsolBalance] = useState<BN | null>(null);

  useEffect(() => {
    if (!publicKey) return;

    const fetchBalance = async () => {
      try {
        const [shortsolMint] = deriveShortsolMintPda(poolId);
        const ata = await getAssociatedTokenAddress(shortsolMint, publicKey);
        const acc = await getAccount(connection, ata);
        setShortsolBalance(new BN(acc.amount.toString()));
      } catch {
        setShortsolBalance(new BN(0));
      }
    };

    fetchBalance();
    const id = setInterval(fetchBalance, 10_000);
    return () => clearInterval(id);
  }, [connection, publicKey]);

  if (!publicKey || !pool || !solPriceUsd) return null;

  const balanceNum = shortsolBalance
    ? Number(shortsolBalance.toString()) / 10 ** SHORTSOL_DECIMALS
    : 0;

  if (balanceNum === 0) {
    return (
      <div className="position-card">
        <h3>{POOLS[poolId]?.name ?? "shortSOL"} Position</h3>
        <p className="position-empty">No position</p>
      </div>
    );
  }

  // Current shortSOL price
  const solPriceBn = new BN(Math.round(solPriceUsd * 1e9));
  const shortsolPriceBn = calcShortsolPrice(pool.k, solPriceBn);
  const shortsolPriceUsd = Number(shortsolPriceBn.toString()) / 1e9;

  // Entry shortSOL price (based on last oracle snapshot)
  const entryShortsolPriceBn = calcShortsolPrice(pool.k, pool.lastOraclePrice);
  const entryShortsolPriceUsd = Number(entryShortsolPriceBn.toString()) / 1e9;
  const entrySolPriceUsd =
    Number(pool.lastOraclePrice.toString()) / 1e9;

  // Position value & P&L
  const positionValue = balanceNum * shortsolPriceUsd;
  const pnlUsd = balanceNum * (shortsolPriceUsd - entryShortsolPriceUsd);
  const pnlPct =
    ((shortsolPriceUsd - entryShortsolPriceUsd) / entryShortsolPriceUsd) * 100;

  // Vault health
  const vaultBalanceUsdc =
    Number(pool.vaultBalance.toString()) / 10 ** USDC_DECIMALS;
  const circulatingHuman =
    Number(pool.circulating.toString()) / 10 ** SHORTSOL_DECIMALS;
  const kHuman = Number(pool.k.toString()) / 1e9;

  const liabilityUsd = circulatingHuman * shortsolPriceUsd;
  const vaultRatio = liabilityUsd > 0 ? vaultBalanceUsdc / liabilityUsd : 1;
  const vaultPct = vaultRatio * 100;
  const vaultBarPct = Math.min(vaultPct, 100);

  // Circuit breaker SOL price (vault ratio drops to 95%)
  const breakerSolPrice =
    vaultBalanceUsdc > 0
      ? (0.95 * circulatingHuman * kHuman) / vaultBalanceUsdc
      : 0;
  const breakerPctFromCurrent =
    ((breakerSolPrice - solPriceUsd) / solPriceUsd) * 100;

  const vaultColor =
    vaultPct >= 100 ? "vault-green" : vaultPct >= 95 ? "vault-yellow" : "vault-red";


  return (
    <div className="position-card">
      <h3>{POOLS[poolId]?.name ?? "shortSOL"} Position</h3>

      <div className="position-rows">
        <div className="position-row">
          <span className="position-label">Balance</span>
          <span className="position-value">{balanceNum.toFixed(4)} {POOLS[poolId]?.name ?? "sSol"}</span>
        </div>
        <div className="position-row">
          <span className="position-label">Entry</span>
          <span className="position-value">
            ${entrySolPriceUsd.toFixed(2)} {POOLS[poolId]?.asset ?? "SOL"} → ${entryShortsolPriceUsd.toFixed(2)} {POOLS[poolId]?.name ?? "sSol"}
          </span>
        </div>
        <div className="position-row">
          <span className="position-label">Current</span>
          <span className="position-value">
            ${solPriceUsd.toFixed(2)} {POOLS[poolId]?.asset ?? "SOL"} → ${shortsolPriceUsd.toFixed(2)} {POOLS[poolId]?.name ?? "sSol"}
          </span>
        </div>
        <div className="position-row">
          <span className="position-label">Value</span>
          <span className="position-value">${positionValue.toFixed(2)}</span>
        </div>
        <div className="position-row position-pnl-row">
          <span className="position-label">P&L</span>
          <span className={`position-value ${pnlUsd >= 0 ? "positive" : "negative"}`}>
            {pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}
            {pnlPct.toFixed(2)}%)
          </span>
        </div>
      </div>

      <div className="vault-health">
        <h4>Vault Health</h4>
        <div className="vault-stats">
          <span>
            Vault: ${vaultBalanceUsdc.toFixed(0)} — Liability: ${liabilityUsd.toFixed(0)}
          </span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill ${vaultColor}`}
            style={{ width: `${vaultBarPct}%` }}
          />
        </div>
        <div className="vault-ratio">
          <span className={vaultColor}>{vaultPct.toFixed(1)}%</span>
        </div>
        <div className="vault-breaker">
          Breaker at SOL ${breakerSolPrice.toFixed(2)} ({breakerPctFromCurrent.toFixed(1)}%)
        </div>
      </div>
    </div>
  );
}
