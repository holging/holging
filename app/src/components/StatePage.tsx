import { usePool } from "../hooks/usePool";
import { usePythPrice } from "../hooks/usePythPrice";
import { POOLS, DEFAULT_POOL_ID } from "../config/pools";
import { calcShortsolPrice, calcDynamicFee } from "../utils/math";
import BN from "bn.js";

const STRESS_DROPS = [0.1, 0.25, 0.5];

function fmtUsdc(val: number): string {
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(val: number, digits = 4): string {
  return val.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function StatePage({ poolId = DEFAULT_POOL_ID }: { poolId?: string }) {
  const { pool } = usePool(poolId);
  const { solPriceUsd } = usePythPrice(POOLS[poolId]?.feedId);

  if (!pool) {
    return <div className="form-card"><p className="form-desc">Loading pool state...</p></div>;
  }

  const solPriceBn = solPriceUsd ? new BN(Math.round(solPriceUsd * 1e9)) : null;
  const k = new BN(pool.k);
  const circulating = Number(pool.circulating) / 1e9;
  const vaultBalance = Number(pool.vaultBalance) / 1e6;
  const feesCollected = Number(pool.totalFeesCollected) / 1e6;
  const totalMinted = Number(pool.totalMinted) / 1e9;
  const totalRedeemed = Number(pool.totalRedeemed) / 1e9;

  // shortSOL price
  const shortsolPrice = solPriceBn && !solPriceBn.isZero()
    ? calcShortsolPrice(k, solPriceBn) : null;
  const shortsolUsd = shortsolPrice ? Number(shortsolPrice) / 1e9 : null;

  // Obligations
  let obligations = 0;
  if (circulating > 0 && shortsolUsd) {
    obligations = circulating * shortsolUsd;
  }

  // Coverage ratio
  const coverageRatio = obligations > 0 ? (vaultBalance / obligations) * 100 : circulating === 0 ? 100 : 0;
  const coverageClass = coverageRatio >= 150 ? "vault-green" : coverageRatio >= 95 ? "vault-yellow" : "vault-red";
  const surplus = vaultBalance - obligations;

  // Circuit breaker
  let breakerPrice = 0;
  let breakerDrop = 0;
  let breakerBuffer = 0;
  if (circulating > 0 && solPriceUsd && vaultBalance > 0) {
    const kNum = Number(pool.k) / 1e9;
    // At breaker: vault_ratio = vaultBalance / (circulating * k / sol_price) = 0.95
    // sol_price_breaker = 0.95 * circulating * kNum / vaultBalance
    breakerPrice = (0.95 * circulating * kNum) / vaultBalance;
    breakerDrop = solPriceUsd > 0 ? ((breakerPrice / solPriceUsd) - 1) * 100 : 0;
    breakerBuffer = vaultBalance - obligations * 0.95;
  }
  // breakerDrop < 0 means SOL must drop to trigger (safe); > 0 means already breached
  const breakerStatus = breakerDrop < -50 ? "SAFE" : breakerDrop < -20 ? "SAFE" : breakerDrop < 0 ? "WARNING" : "DANGER";
  const breakerStatusClass = breakerStatus === "SAFE" ? "vault-green" : breakerStatus === "WARNING" ? "vault-yellow" : "vault-red";

  // Dynamic fee
  const dynamicFeeBps = solPriceBn
    ? calcDynamicFee(
        new BN(pool.feeBps), new BN(pool.vaultBalance),
        new BN(pool.circulating), k, solPriceBn
      ).toNumber()
    : pool.feeBps;

  // Oracle age
  const oracleAge = pool.lastOracleTimestamp
    ? Math.floor(Date.now() / 1000) - Number(pool.lastOracleTimestamp)
    : null;
  const oracleStatus = oracleAge !== null && oracleAge < 120 ? "Fresh" : "Stale";
  const oracleClass = oracleAge !== null && oracleAge < 60 ? "vault-green" : "vault-red";

  // Stress test
  const stressResults = STRESS_DROPS.map((drop) => {
    if (!solPriceUsd || circulating === 0) return { drop, ratio: coverageRatio, status: "—" };
    const newSol = solPriceUsd * (1 - drop);
    const kNum = Number(pool.k) / 1e9;
    const newShortsolUsd = kNum / newSol;
    const newObligations = circulating * newShortsolUsd;
    const ratio = newObligations > 0 ? (vaultBalance / newObligations) * 100 : 100;
    return { drop, ratio, status: ratio >= 95 ? "OK" : "BREAK" };
  });

  return (
    <div className="form-card">
      <h3>Protocol State</h3>

      <div className="risk-section">
        <h4>VAULT HEALTH</h4>
        <div className="risk-row"><span>Vault Balance</span><span>{fmtUsdc(vaultBalance)}</span></div>
        <div className="risk-row"><span>Obligations</span><span>{fmtUsdc(obligations)}</span></div>
        <div className="risk-row"><span>Coverage Ratio</span><span className={coverageClass}>{fmtNum(coverageRatio, 1)}%</span></div>
        <div className="progress-bar">
          <div className={`progress-fill ${coverageClass}`} style={{ width: `${Math.min(coverageRatio, 100)}%` }} />
        </div>
        <div className="risk-row"><span>{surplus >= 0 ? "Surplus" : "Deficit"}</span><span className={surplus >= 0 ? "vault-green" : "vault-red"}>{fmtUsdc(Math.abs(surplus))}</span></div>
      </div>

      <div className="risk-section">
        <h4>CIRCUIT BREAKER</h4>
        {circulating > 0 ? (
          <>
            <div className="risk-row"><span>Status</span><span className={breakerStatusClass}>{breakerStatus}</span></div>
            <div className="risk-row"><span>Trigger SOL Price</span><span>{fmtUsdc(breakerPrice)}</span></div>
            <div className="risk-row"><span>SOL must drop</span><span>{breakerDrop < 0 ? fmtNum(Math.abs(breakerDrop), 1) + "%" : "Already breached"}</span></div>
            <div className="risk-row"><span>Buffer</span><span>{fmtUsdc(Math.max(breakerBuffer, 0))}</span></div>
          </>
        ) : (
          <p className="form-desc">No circulating supply — circuit breaker inactive</p>
        )}
      </div>

      <div className="risk-section">
        <h4>PROTOCOL METRICS</h4>
        <div className="risk-row"><span>Total Minted</span><span>{fmtNum(totalMinted)} {POOLS[poolId]?.name ?? "shortSOL"}</span></div>
        <div className="risk-row"><span>Total Redeemed</span><span>{fmtNum(totalRedeemed)} {POOLS[poolId]?.name ?? "shortSOL"}</span></div>
        <div className="risk-row"><span>Circulating</span><span>{fmtNum(circulating)} {POOLS[poolId]?.name ?? "shortSOL"}</span></div>
        <div className="risk-row"><span>Fees Collected</span><span>{fmtUsdc(feesCollected)}</span></div>
        <div className="risk-row"><span>Current Fee</span><span>{(dynamicFeeBps / 100).toFixed(2)}% (dynamic)</span></div>
        <div className="risk-row"><span>Pool Status</span><span className={pool.paused ? "vault-red" : "vault-green"}>{pool.paused ? "PAUSED" : "ACTIVE"}</span></div>
      </div>

      <div className="risk-section">
        <h4>ORACLE</h4>
        <div className="risk-row"><span>SOL/USD</span><span>{solPriceUsd ? fmtUsdc(solPriceUsd) : "—"}</span></div>
        <div className="risk-row"><span>{POOLS[poolId]?.name ?? "shortSOL"}</span><span>{shortsolUsd ? fmtUsdc(shortsolUsd) : "—"}</span></div>
        <div className="risk-row"><span>Oracle Age</span><span className={oracleClass}>{oracleAge !== null ? `${oracleAge}s` : "—"}</span></div>
        <div className="risk-row"><span>Status</span><span className={oracleClass}>{oracleStatus}</span></div>
      </div>

      <div className="risk-section">
        <h4>STRESS TEST</h4>
        <div className="stress-header" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <span>SOL Drop</span><span>Vault Ratio</span><span>Breaker</span>
        </div>
        {stressResults.map((r) => (
          <div key={r.drop} className={`stress-row ${r.status === "BREAK" ? "stress-danger" : ""}`} style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <span>-{(r.drop * 100).toFixed(0)}%</span>
            <span>{fmtNum(r.ratio, 1)}%</span>
            <span className={r.status === "OK" ? "vault-green" : "vault-red"}>{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
