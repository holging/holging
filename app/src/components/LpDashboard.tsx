import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { useSolshort } from "../hooks/useSolshort";
import { usePool } from "../hooks/usePool";
import { formatUsdc, usdcToLamports } from "../utils/math";
import {
  getProgram,
  deriveLpPositionPda,
  deriveLpMintPda,
} from "../utils/program";
import BN from "bn.js";

interface LpDashboardProps {
  pool: any;
  solPriceUsd: number;
  usdcMint: PublicKey;
}

interface LpPosition {
  shares: BN;
  feeDebtPerShare: BN;
  depositedUsdc: BN;
}

const MIN_DEPOSIT_USDC = 100;

export function LpDashboard({ pool, solPriceUsd: _solPriceUsd, usdcMint }: LpDashboardProps) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addLiquidity, removeLiquidity, claimLpFees, loading, error, txSig } =
    useSolshort();
  const { refresh: refreshPool } = usePool();

  // On-chain LP position state
  const [lpPosition, setLpPosition] = useState<LpPosition | null>(null);
  const [lpPositionLoading, setLpPositionLoading] = useState(false);

  // LP token balance (from ATA)
  const [lpBalance, setLpBalance] = useState<BN>(new BN(0));

  // USDC wallet balance
  const [usdcBalance, setUsdcBalance] = useState<number>(0);

  // Form state
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");

  // Action feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionTxSig, setActionTxSig] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const fetchLpPosition = useCallback(async () => {
    if (!wallet?.publicKey) return;
    setLpPositionLoading(true);
    try {
      const program = getProgram(connection, wallet);
      const [lpPositionPda] = deriveLpPositionPda(wallet.publicKey);
      const pos = await (program.account as any).lpPosition.fetch(lpPositionPda);
      setLpPosition({
        shares: pos.shares,
        feeDebtPerShare: pos.feeDebtPerShare,
        depositedUsdc: pos.depositedUsdc,
      });
    } catch {
      // Account doesn't exist yet — first deposit
      setLpPosition(null);
    } finally {
      setLpPositionLoading(false);
    }
  }, [connection, wallet]);

  const fetchLpBalance = useCallback(async () => {
    if (!wallet?.publicKey) return;
    try {
      const [lpMint] = deriveLpMintPda();
      const ata = await getAssociatedTokenAddress(lpMint, wallet.publicKey);
      const acc = await getAccount(connection, ata);
      setLpBalance(new BN(acc.amount.toString()));
    } catch {
      setLpBalance(new BN(0));
    }
  }, [connection, wallet]);

  const fetchUsdcBalance = useCallback(async () => {
    if (!wallet?.publicKey) return;
    try {
      const ata = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
      const acc = await getAccount(connection, ata);
      setUsdcBalance(Number(acc.amount) / 1e6);
    } catch {
      setUsdcBalance(0);
    }
  }, [connection, wallet, usdcMint]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchLpPosition(), fetchLpBalance(), fetchUsdcBalance()]);
    setTimeout(refreshPool, 1500);
  }, [fetchLpPosition, fetchLpBalance, fetchUsdcBalance, refreshPool]);

  useEffect(() => {
    refreshAll();
    const id = setInterval(refreshAll, 20_000);
    return () => clearInterval(id);
  }, [refreshAll]);

  // ── Derived metrics ──────────────────────────────────────────────────────────

  // LP total supply from pool
  const lpTotalSupplyBn: BN = pool?.lpTotalSupply
    ? new BN(pool.lpTotalSupply.toString())
    : new BN(0);

  // Pool share %
  const poolSharePct =
    lpTotalSupplyBn.gtn(0) && lpBalance.gtn(0)
      ? (lpBalance.toNumber() / lpTotalSupplyBn.toNumber()) * 100
      : 0;

  // Pending fees estimate
  // pending = shares * (feePerShareAccumulated - feeDebtPerShare) / PRECISION
  const FEE_PRECISION = new BN(1_000_000_000);
  const pendingFeesBn: BN = (() => {
    if (!lpPosition || !pool?.feePerShareAccumulated) return new BN(0);
    try {
      const accum = new BN(pool.feePerShareAccumulated.toString());
      const debt = lpPosition.feeDebtPerShare;
      const delta = accum.sub(debt);
      if (delta.lten(0)) return new BN(0);
      return lpPosition.shares.mul(delta).div(FEE_PRECISION);
    } catch {
      return new BN(0);
    }
  })();
  // Vault APY estimate: totalFeesCollected / lpPrincipal * 365 / poolAgeDays
  const vaultApyPct = (() => {
    if (!pool?.totalFeesCollected || !pool?.lpPrincipal) return null;
    const principal = new BN(pool.lpPrincipal.toString()).toNumber() / 1e6;
    if (principal <= 0) return null;
    const fees = new BN(pool.totalFeesCollected.toString()).toNumber() / 1e6;
    // Use lastOracleTimestamp as a proxy for pool age if available
    const poolAgeSec = pool?.lastOracleTimestamp
      ? Math.max(1, Math.floor(Date.now() / 1000) - Number(pool.lastOracleTimestamp.toString()))
      : 86400;
    const poolAgeDays = poolAgeSec / 86400;
    return (fees / principal) * (365 / poolAgeDays) * 100;
  })();

  // Deposit preview: USDC → LP shares
  // shares = usdcAmount * lpTotalSupply / vaultBalance (or 1:1 if first deposit)
  const depositParsed = parseFloat(depositAmount);
  const depositPreviewShares = (() => {
    if (!depositAmount || !isFinite(depositParsed) || depositParsed <= 0) return null;
    const usdcBn = usdcToLamports(depositParsed);
    if (lpTotalSupplyBn.isZero() || !pool?.vaultBalance) {
      return usdcBn; // 1:1 bootstrap
    }
    const vault = new BN(pool.vaultBalance.toString());
    if (vault.isZero()) return usdcBn;
    return usdcBn.mul(lpTotalSupplyBn).div(vault);
  })();

  // Withdraw preview: LP shares → USDC
  const withdrawParsed = parseFloat(withdrawShares);
  const withdrawPreviewUsdc = (() => {
    if (!withdrawShares || !isFinite(withdrawParsed) || withdrawParsed <= 0) return null;
    const sharesBn = new BN(Math.round(withdrawParsed * 1e9));
    if (lpTotalSupplyBn.isZero() || !pool?.vaultBalance) return null;
    const vault = new BN(pool.vaultBalance.toString());
    return sharesBn.mul(vault).div(lpTotalSupplyBn);
  })();

  // Validation
  const depositIsValid =
    depositAmount !== "" &&
    isFinite(depositParsed) &&
    depositParsed >= MIN_DEPOSIT_USDC &&
    depositParsed <= usdcBalance;

  const lpSharesHuman = lpBalance.toNumber() / 1e9;

  const withdrawIsValid =
    withdrawShares !== "" &&
    isFinite(withdrawParsed) &&
    withdrawParsed > 0 &&
    withdrawParsed <= lpSharesHuman;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleDeposit = async () => {
    if (!depositIsValid) return;
    setActionError(null);
    setActionTxSig(null);
    try {
      const sig = await addLiquidity(usdcToLamports(depositParsed), usdcMint);
      setLastAction("deposit");
      setActionTxSig(sig ?? null);
      setDepositAmount("");
      await refreshAll();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawIsValid) return;
    setActionError(null);
    setActionTxSig(null);
    try {
      const sharesBn = new BN(Math.round(withdrawParsed * 1e9));
      const sig = await removeLiquidity(sharesBn, usdcMint);
      setLastAction("withdraw");
      setActionTxSig(sig ?? null);
      setWithdrawShares("");
      await refreshAll();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleClaim = async () => {
    if (pendingFeesBn.isZero()) return;
    setActionError(null);
    setActionTxSig(null);
    try {
      const sig = await claimLpFees(usdcMint);
      setLastAction("claim");
      setActionTxSig(sig ?? null);
      await refreshAll();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!wallet) {
    return (
      <div className="form-card lp-dashboard">
        <h3>LP Dashboard</h3>
        <p className="lp-empty">Connect wallet to manage liquidity</p>
      </div>
    );
  }

  const txSigFinal = actionTxSig || txSig;
  const errorFinal = actionError || error;

  return (
    <div className="form-card lp-dashboard">
      <h3>LP Dashboard</h3>
      <p className="form-desc">Provide liquidity — earn protocol fees</p>

      {/* ── A. LP Position Summary ── */}
      <div className="lp-position-card">
        <div className="lp-position-header">
          <span className="lp-section-label">Your Position</span>
          {lpPositionLoading && (
            <span className="lp-loading-dot">loading...</span>
          )}
        </div>

        <div className="lp-metrics-grid">
          <div className="lp-metric">
            <span className="lp-metric-label">LP Shares</span>
            <span className="lp-metric-value">
              {lpBalance.isZero() ? "—" : lpSharesHuman.toFixed(4)}
            </span>
          </div>
          <div className="lp-metric">
            <span className="lp-metric-label">Pool Share</span>
            <span className="lp-metric-value">
              {poolSharePct > 0 ? `${poolSharePct.toFixed(3)}%` : "—"}
            </span>
          </div>
          <div className="lp-metric lp-metric-highlight">
            <span className="lp-metric-label">Pending Fees</span>
            <span className="lp-metric-value lp-fees-value">
              {pendingFeesBn.isZero()
                ? "$0.00"
                : formatUsdc(pendingFeesBn)}
            </span>
          </div>
          <div className="lp-metric">
            <span className="lp-metric-label">Vault APY</span>
            <span className="lp-metric-value">
              {vaultApyPct !== null ? (
                <span className={vaultApyPct >= 0 ? "positive" : "negative"}>
                  {vaultApyPct.toFixed(1)}%
                </span>
              ) : (
                <span className="lp-metric-dim">—</span>
              )}
            </span>
          </div>
        </div>

        {lpPosition && !lpPosition.depositedUsdc.isZero() && (
          <div className="lp-deposited-hint">
            Deposited principal:{" "}
            <strong>{formatUsdc(lpPosition.depositedUsdc)}</strong>
          </div>
        )}

        {!lpPosition && !lpPositionLoading && (
          <p className="lp-no-position">No LP position yet — make a deposit below</p>
        )}
      </div>

      {/* ── B. Add Liquidity ── */}
      <div className="lp-section">
        <div className="lp-section-label">Deposit USDC</div>

        <div className="lp-input-group">
          <input
            type="number"
            placeholder="USDC amount"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            min={MIN_DEPOSIT_USDC}
            step="10"
            aria-label="USDC deposit amount"
          />
          <button
            className="max-btn"
            type="button"
            onClick={() =>
              setDepositAmount(usdcBalance > 0 ? usdcBalance.toFixed(2) : "")
            }
            disabled={usdcBalance <= 0}
          >
            Max
          </button>
          <span className="input-suffix">USDC</span>
        </div>

        <div className="lp-hints">
          {usdcBalance > 0 && (
            <span className="balance-hint">
              Balance: {usdcBalance.toFixed(2)} USDC
            </span>
          )}
          <span className="balance-hint">Min deposit: ${MIN_DEPOSIT_USDC}</span>
        </div>

        {depositAmount && isFinite(depositParsed) && depositParsed < MIN_DEPOSIT_USDC && depositParsed > 0 && (
          <p className="error">Minimum deposit is ${MIN_DEPOSIT_USDC}</p>
        )}
        {depositAmount && isFinite(depositParsed) && depositParsed > usdcBalance && usdcBalance > 0 && (
          <p className="error">Exceeds balance</p>
        )}

        {depositPreviewShares && depositIsValid && (
          <div className="lp-preview">
            <span>You will receive</span>
            <span className="lp-preview-value">
              ~{(depositPreviewShares.toNumber() / 1e9).toFixed(4)} LP shares
            </span>
          </div>
        )}

        <button
          onClick={handleDeposit}
          disabled={loading || !depositIsValid}
          className="lp-action-btn"
        >
          {loading && lastAction === "deposit" ? "Depositing..." : "Deposit USDC"}
        </button>
      </div>

      {/* ── C. Remove Liquidity ── */}
      <div className="lp-section">
        <div className="lp-section-label">Withdraw</div>

        <div className="lp-input-group">
          <input
            type="number"
            placeholder="LP shares to withdraw"
            value={withdrawShares}
            onChange={(e) => setWithdrawShares(e.target.value)}
            min="0"
            step="0.0001"
            aria-label="LP shares to withdraw"
          />
          <button
            className="max-btn"
            type="button"
            onClick={() =>
              setWithdrawShares(
                lpSharesHuman > 0 ? lpSharesHuman.toFixed(4) : ""
              )
            }
            disabled={lpBalance.isZero()}
          >
            Max
          </button>
          <span className="input-suffix">LP</span>
        </div>

        {lpBalance.gtn(0) && (
          <p className="balance-hint">
            Balance: {lpSharesHuman.toFixed(4)} LP shares
          </p>
        )}

        {withdrawShares && isFinite(withdrawParsed) && withdrawParsed > lpSharesHuman && (
          <p className="error">Exceeds LP balance</p>
        )}

        {withdrawPreviewUsdc && withdrawIsValid && (
          <div className="lp-preview">
            <span>You will receive</span>
            <span className="lp-preview-value">
              ~{formatUsdc(withdrawPreviewUsdc)} USDC
            </span>
          </div>
        )}

        <button
          onClick={handleWithdraw}
          disabled={loading || !withdrawIsValid}
          className="lp-action-btn lp-action-btn-secondary"
        >
          {loading && lastAction === "withdraw" ? "Withdrawing..." : "Withdraw"}
        </button>
      </div>

      {/* ── D. Claim Fees ── */}
      <div className="lp-claim">
        <div className="lp-claim-info">
          <div className="lp-claim-label">Pending Fees</div>
          <div
            className={`lp-claim-amount ${pendingFeesBn.gtn(0) ? "lp-fees-value" : "lp-metric-dim"}`}
          >
            {pendingFeesBn.isZero() ? "$0.00" : formatUsdc(pendingFeesBn)}
          </div>
        </div>
        <button
          onClick={handleClaim}
          disabled={loading || pendingFeesBn.isZero()}
          className="lp-claim-btn"
          aria-label="Claim pending LP fees"
        >
          {loading && lastAction === "claim" ? "Claiming..." : "Claim Fees"}
        </button>
      </div>

      {/* ── Feedback ── */}
      {errorFinal && <p className="error">{errorFinal}</p>}
      {txSigFinal && (
        <p className="success">
          {lastAction === "deposit" && "Deposit successful! "}
          {lastAction === "withdraw" && "Withdrawal successful! "}
          {lastAction === "claim" && "Fees claimed! "}
          <a
            href={`https://explorer.solana.com/tx/${txSigFinal}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View TX
          </a>
        </p>
      )}
    </div>
  );
}
