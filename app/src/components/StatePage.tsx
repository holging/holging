import { usePool } from "../hooks/usePool";
import { usePythPrice } from "../hooks/usePythPrice";
import { POOLS, DEFAULT_POOL_ID } from "../config/pools";
import { calcShortsolPrice, calcDynamicFee } from "../utils/math";
import { PROGRAM_ID } from "../utils/program";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const STRESS_DROPS = [0.1, 0.25, 0.5, 0.75, 0.9];

function fmtUsdc(val: number): string {
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(val: number, digits = 4): string {
  return val.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtAge(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

function shortenAddress(addr: string): string {
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

export function StatePage({ poolId = DEFAULT_POOL_ID }: { poolId?: string }) {
  const { pool } = usePool(poolId);
  const { solPriceUsd } = usePythPrice(POOLS[poolId]?.feedId);
  const poolConfig = POOLS[poolId];
  const tokenName = poolConfig?.name ?? "shortSOL";
  const assetName = poolConfig?.asset ?? "SOL";

  if (!pool) {
    return <div className="form-card"><p className="form-desc">Loading pool state...</p></div>;
  }

  const solPriceBn = solPriceUsd ? new BN(Math.round(solPriceUsd * 1e9)) : null;
  const k = new BN(pool.k);
  const kNum = Number(pool.k) / 1e9;
  const circulating = Number(pool.circulating) / 1e9;
  const vaultBalance = Number(pool.vaultBalance) / 1e6;
  const feesCollected = Number(pool.totalFeesCollected) / 1e6;
  const totalMinted = Number(pool.totalMinted) / 1e9;
  const totalRedeemed = Number(pool.totalRedeemed) / 1e9;
  const lpPrincipal = Number(pool.lpPrincipal) / 1e6;
  const lpTotalSupply = Number(pool.lpTotalSupply) / 1e9;

  // shortSOL price
  const shortsolPrice = solPriceBn && !solPriceBn.isZero()
    ? calcShortsolPrice(k, solPriceBn) : null;
  const shortsolUsd = shortsolPrice ? Number(shortsolPrice) / 1e9 : null;

  // Obligations
  let obligations = 0;
  if (circulating > 0 && shortsolUsd) {
    obligations = circulating * shortsolUsd;
  }

  // Utilization
  const utilization = lpPrincipal > 0 ? (obligations / lpPrincipal) * 100 : 0;

  // Coverage ratio
  const coverageRatio = obligations > 0 ? (vaultBalance / obligations) * 100 : circulating === 0 ? 100 : 0;
  const coverageClass = coverageRatio >= 150 ? "vault-green" : coverageRatio >= 95 ? "vault-yellow" : "vault-red";
  const surplus = vaultBalance - obligations;

  // Circuit breaker
  let breakerPrice = 0;
  let breakerDrop = 0;
  let breakerBuffer = 0;
  if (circulating > 0 && solPriceUsd && vaultBalance > 0) {
    breakerPrice = (0.95 * circulating * kNum) / vaultBalance;
    breakerDrop = solPriceUsd > 0 ? ((breakerPrice / solPriceUsd) - 1) * 100 : 0;
    breakerBuffer = vaultBalance - obligations * 0.95;
  }
  const breakerStatus = breakerDrop < -50 ? "SAFE" : breakerDrop < -20 ? "SAFE" : breakerDrop < 0 ? "WARNING" : "DANGER";
  const breakerStatusClass = breakerStatus === "SAFE" ? "vault-green" : breakerStatus === "WARNING" ? "vault-yellow" : "vault-red";

  // Dynamic fee
  const dynamicFeeBps = solPriceBn
    ? calcDynamicFee(
        new BN(pool.feeBps), new BN(pool.vaultBalance),
        new BN(pool.circulating), k, solPriceBn
      ).toNumber()
    : pool.feeBps;

  // Oracle age — devnet staleness is 259200s (3 days) for stock feeds
  const MAX_STALENESS_DEVNET = 259200;
  const oracleAge = pool.lastOracleTimestamp
    ? Math.floor(Date.now() / 1000) - Number(pool.lastOracleTimestamp)
    : null;
  const oracleStatus = oracleAge !== null && oracleAge < MAX_STALENESS_DEVNET ? "Fresh" : "Stale";
  const oracleClass = oracleAge !== null && oracleAge < 300 ? "vault-green" : oracleAge !== null && oracleAge < MAX_STALENESS_DEVNET ? "vault-yellow" : "vault-red";

  // LP APY (realistic)
  const fundingApyBase = (1 - Math.pow(0.999, 365)) * 100;
  const fundingApy = fundingApyBase * Math.min(utilization / 100, 1);

  // Fee tiers explanation
  const feeLevel = dynamicFeeBps <= pool.feeBps / 2 ? "Discounted (vault healthy)" : coverageRatio > 200 ? "Base" : coverageRatio > 150 ? "Elevated" : coverageRatio > 100 ? "High" : "Critical";

  // Addresses
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(poolId)],
    PROGRAM_ID
  );
  const [shortsolMintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("shortsol_mint"), Buffer.from(poolId)],
    PROGRAM_ID
  );
  const USDC_MINT = new PublicKey("CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn");
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), USDC_MINT.toBuffer(), Buffer.from(poolId)],
    PROGRAM_ID
  );
  const [lpMintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_mint"), poolPda.toBuffer()],
    PROGRAM_ID
  );

  // Stress test
  const stressResults = STRESS_DROPS.map((drop) => {
    if (!solPriceUsd || circulating === 0) return { drop, ratio: coverageRatio, newPrice: 0, newShortPrice: 0, newObligations: 0, status: "—" as const };
    const newSol = solPriceUsd * (1 - drop);
    const newShortsolUsd = kNum / newSol;
    const newObligations = circulating * newShortsolUsd;
    const ratio = newObligations > 0 ? (vaultBalance / newObligations) * 100 : 100;
    return { drop, ratio, newPrice: newSol, newShortPrice: newShortsolUsd, newObligations, status: (ratio >= 95 ? "OK" : "BREAK") as "OK" | "BREAK" };
  });

  const explorerBase = "https://explorer.solana.com/address/";
  const cluster = "?cluster=devnet";

  return (
    <div className="form-card">
      <h3>Protocol State</h3>
      <p className="form-desc">{assetName} pool — on-chain data, read-only</p>

      {/* ── PRICES ── */}
      <div className="risk-section">
        <h4>PRICES</h4>
        <div className="risk-row"><span>{assetName}/USD</span><span>{solPriceUsd ? fmtUsdc(solPriceUsd) : "—"}</span></div>
        <div className="risk-row"><span>{tokenName} price</span><span>{shortsolUsd ? fmtUsdc(shortsolUsd) : "—"}</span></div>
        <div className="risk-row"><span>k (normalizing constant)</span><span>{fmtNum(kNum, 2)}</span></div>
        <div className="risk-row"><span>Formula</span><span style={{ fontFamily: "monospace", fontSize: "0.85em" }}>{tokenName} = k / {assetName}</span></div>
      </div>

      {/* ── VAULT HEALTH ── */}
      <div className="risk-section">
        <h4>VAULT HEALTH</h4>
        <div className="risk-row"><span>Vault Balance</span><span>{fmtUsdc(vaultBalance)}</span></div>
        <div className="risk-row"><span>Obligations</span><span>{fmtUsdc(obligations)}</span></div>
        <div className="risk-row"><span>Coverage Ratio</span><span className={coverageClass}>{fmtNum(coverageRatio, 1)}%</span></div>
        <div className="progress-bar">
          <div className={`progress-fill ${coverageClass}`} style={{ width: `${Math.min(coverageRatio / 100, 100)}%` }} />
        </div>
        <div className="risk-row"><span>{surplus >= 0 ? "Surplus" : "Deficit"}</span><span className={surplus >= 0 ? "vault-green" : "vault-red"}>{fmtUsdc(Math.abs(surplus))}</span></div>
        <div className="risk-row"><span>Utilization</span><span>{fmtNum(utilization, 2)}%</span></div>
      </div>

      {/* ── CIRCUIT BREAKER ── */}
      <div className="risk-section">
        <h4>CIRCUIT BREAKER</h4>
        <p className="form-desc" style={{ margin: "0 0 8px", fontSize: "0.8em" }}>Auto-pauses pool if vault coverage drops below 95%</p>
        {circulating > 0 ? (
          <>
            <div className="risk-row"><span>Status</span><span className={breakerStatusClass}>{breakerStatus}</span></div>
            <div className="risk-row"><span>Trigger {assetName} Price</span><span>{fmtUsdc(breakerPrice)}</span></div>
            <div className="risk-row"><span>{assetName} must drop</span><span>{breakerDrop < 0 ? fmtNum(Math.abs(breakerDrop), 1) + "%" : "Already breached"}</span></div>
            <div className="risk-row"><span>Buffer</span><span>{fmtUsdc(Math.max(breakerBuffer, 0))}</span></div>
          </>
        ) : (
          <p className="form-desc">No circulating supply — circuit breaker inactive</p>
        )}
      </div>

      {/* ── PROTOCOL METRICS ── */}
      <div className="risk-section">
        <h4>PROTOCOL METRICS</h4>
        <div className="risk-row"><span>Total Minted</span><span>{fmtNum(totalMinted)} {tokenName}</span></div>
        <div className="risk-row"><span>Total Redeemed</span><span>{fmtNum(totalRedeemed)} {tokenName}</span></div>
        <div className="risk-row"><span>Circulating</span><span>{fmtNum(circulating)} {tokenName}</span></div>
        <div className="risk-row"><span>Circulating Value</span><span>{fmtUsdc(obligations)}</span></div>
        <div className="risk-row"><span>Fees Collected</span><span>{fmtUsdc(feesCollected)}</span></div>
        <div className="risk-row"><span>Current Fee</span><span>{(dynamicFeeBps / 100).toFixed(2)}% ({feeLevel})</span></div>
        <div className="risk-row"><span>Pool Status</span><span className={pool.paused ? "vault-red" : "vault-green"}>{pool.paused ? "⏸ PAUSED" : "● ACTIVE"}</span></div>
      </div>

      {/* ── LP SYSTEM ── */}
      <div className="risk-section">
        <h4>LP SYSTEM</h4>
        <div className="risk-row"><span>LP Total Supply</span><span>{fmtNum(lpTotalSupply)} LP</span></div>
        <div className="risk-row"><span>LP Principal</span><span>{fmtUsdc(lpPrincipal)}</span></div>
        <div className="risk-row"><span>Pending Fees (all LPs)</span><span>{fmtUsdc(Number(pool.totalLpFeesPending) / 1e6)}</span></div>
        <div className="risk-row"><span>Funding APY (current)</span><span className="vault-green">{fmtNum(fundingApy, 2)}%</span></div>
        <div className="risk-row"><span>Funding APY (at 100% util)</span><span>{fmtNum(fundingApyBase, 1)}%</span></div>
        <div className="risk-row"><span>Min LP Deposit</span><span>{fmtUsdc(Number(pool.minLpDeposit) / 1e6)}</span></div>
      </div>

      {/* ── ORACLE ── */}
      <div className="risk-section">
        <h4>ORACLE</h4>
        <div className="risk-row"><span>Provider</span><span>Pyth Network</span></div>
        <div className="risk-row"><span>Cached Price</span><span>{fmtUsdc(Number(pool.lastOraclePrice) / 1e9)}</span></div>
        <div className="risk-row"><span>Live Price</span><span>{solPriceUsd ? fmtUsdc(solPriceUsd) : "—"}</span></div>
        <div className="risk-row"><span>Oracle Age</span><span className={oracleClass}>{oracleAge !== null ? fmtAge(oracleAge) : "—"}</span></div>
        <div className="risk-row"><span>Status</span><span className={oracleClass}>{oracleStatus}</span></div>
        <div className="risk-row"><span>Max Staleness</span><span>259200s (devnet) / 30s (mainnet)</span></div>
        <div className="risk-row"><span>Max Deviation</span><span>15%</span></div>
      </div>

      {/* ── STRESS TEST ── */}
      <div className="risk-section">
        <h4>STRESS TEST</h4>
        <p className="form-desc" style={{ margin: "0 0 8px", fontSize: "0.8em" }}>What happens if {assetName} price drops</p>
        <div className="stress-header" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <span>{assetName} Drop</span><span>{assetName} Price</span><span>Vault Ratio</span><span>Breaker</span>
        </div>
        {stressResults.map((r) => (
          <div key={r.drop} className={`stress-row ${r.status === "BREAK" ? "stress-danger" : ""}`} style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <span>-{(r.drop * 100).toFixed(0)}%</span>
            <span>{r.newPrice > 0 ? fmtUsdc(r.newPrice) : "—"}</span>
            <span>{fmtNum(r.ratio, 1)}%</span>
            <span className={r.status === "OK" ? "vault-green" : r.status === "BREAK" ? "vault-red" : ""}>{r.status}</span>
          </div>
        ))}
      </div>

      {/* ── ADDRESSES ── */}
      <div className="risk-section">
        <h4>ADDRESSES</h4>
        <div className="risk-row">
          <span>Program</span>
          <a href={explorerBase + PROGRAM_ID.toBase58() + cluster} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "none" }}>
            {shortenAddress(PROGRAM_ID.toBase58())}
          </a>
        </div>
        <div className="risk-row">
          <span>Pool PDA</span>
          <a href={explorerBase + poolPda.toBase58() + cluster} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "none" }}>
            {shortenAddress(poolPda.toBase58())}
          </a>
        </div>
        <div className="risk-row">
          <span>{tokenName} Mint</span>
          <a href={explorerBase + shortsolMintPda.toBase58() + cluster} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "none" }}>
            {shortenAddress(shortsolMintPda.toBase58())}
          </a>
        </div>
        <div className="risk-row">
          <span>USDC Vault</span>
          <a href={explorerBase + vaultPda.toBase58() + cluster} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "none" }}>
            {shortenAddress(vaultPda.toBase58())}
          </a>
        </div>
        {pool.lpMint && pool.lpMint !== "11111111111111111111111111111111" && (
          <div className="risk-row">
            <span>LP Mint</span>
            <a href={explorerBase + lpMintPda.toBase58() + cluster} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "none" }}>
              {shortenAddress(lpMintPda.toBase58())}
            </a>
          </div>
        )}
        <div className="risk-row">
          <span>Authority</span>
          <a href={explorerBase + pool.authority + cluster} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "none" }}>
            {shortenAddress(pool.authority)}
          </a>
        </div>
        <div className="risk-row"><span>Network</span><span>Solana Devnet</span></div>
      </div>
    </div>
  );
}
