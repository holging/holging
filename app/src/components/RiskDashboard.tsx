import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { usePool } from "../hooks/usePool";
import { usePythPrice } from "../hooks/usePythPrice";
import { useSolshort } from "../hooks/useSolshort";
import { PROGRAM_ID } from "../utils/program";
import { POOLS, DEFAULT_POOL_ID } from "../config/pools";
import {
  calcShortsolPrice,
  calcRequiredLiquidity,
  calcLiquidityGap,
  calcDailyFeeBuffer,
  calcDaysToSelfFund,
  calcRequiredVolume,
  calcDailyIL,
  calcArbVolume,
  calcAmmFeeRevenue,
  calcProtocolFeeRevenue,
  calcBreakevenAmmFee,
  usdcToLamports,
  USDC_DECIMALS,
  SHORTSOL_DECIMALS,
} from "../utils/math";
import BN from "bn.js";

const USDC_MINT_PK = new PublicKey(
  import.meta.env.VITE_USDC_MINT || "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn"
);

const STRESS_DROPS = [0.1, 0.25, 0.33, 0.5, 0.75, 0.9];

const PRESETS = [
  { label: "Conservative", drop: 0.25 },
  { label: "Moderate", drop: 0.5 },
  { label: "Aggressive", drop: 0.75 },
];

export function RiskDashboard({ poolId = DEFAULT_POOL_ID }: { poolId?: string }) {
  const { pool, refresh: refreshPool } = usePool(poolId);
  const { solPriceUsd } = usePythPrice(POOLS[poolId]?.feedId);
  const { addLiquidity, setPause, updateK, loading: txLoading, error: txError } = useSolshort(poolId);

  // Calculator inputs
  const [targetTvl, setTargetTvl] = useState(100_000);
  const [maxDrop, setMaxDrop] = useState(0.5);
  const [dailyVolume, setDailyVolume] = useState(50_000);
  const [feeBps, setFeeBps] = useState(4);

  // Add liquidity state
  const [liqAmount, setLiqAmount] = useState(100);
  const [liqSuccess, setLiqSuccess] = useState<string | null>(null);
  const [liqError, setLiqError] = useState<string | null>(null);

  // Admin controls state
  const [pauseSuccess, setPauseSuccess] = useState<string | null>(null);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [newKInput, setNewKInput] = useState("");
  const [kSuccess, setKSuccess] = useState<string | null>(null);
  const [kError, setKError] = useState<string | null>(null);

  // AMM simulator inputs
  const [ammPoolSize, setAmmPoolSize] = useState(50_000);
  const [ammDailyVol, setAmmDailyVol] = useState(4);
  const [ammFeePct, setAmmFeePct] = useState(0.25);

  const fee = feeBps / 10_000;

  // Pool metrics (from on-chain)
  const vaultBalanceUsdc = pool
    ? Number(pool.vaultBalance.toString()) / 10 ** USDC_DECIMALS
    : 0;
  const circulatingHuman = pool
    ? Number(pool.circulating.toString()) / 10 ** SHORTSOL_DECIMALS
    : 0;
  const kHuman = pool ? Number(pool.k.toString()) / 1e9 : 0;
  const feesCollected = pool
    ? Number(pool.totalFeesCollected.toString()) / 10 ** USDC_DECIMALS
    : 0;

  // Additional pool metrics
  const totalMintedHuman = pool
    ? Number(pool.totalMinted.toString()) / 10 ** SHORTSOL_DECIMALS
    : 0;
  const totalRedeemedHuman = pool
    ? Number(pool.totalRedeemed.toString()) / 10 ** SHORTSOL_DECIMALS
    : 0;
  const oraclePriceUsd = pool
    ? Number(pool.lastOraclePrice.toString()) / 1e9
    : 0;
  const oracleAge = pool
    ? Math.max(0, Math.floor(Date.now() / 1000) - Number(pool.lastOracleTimestamp.toString()))
    : 0;
  const programIdShort = PROGRAM_ID.toBase58().slice(0, 8) + "..." + PROGRAM_ID.toBase58().slice(-4);

  // Current shortSOL price
  const shortsolPriceUsd =
    pool && solPriceUsd
      ? (() => {
          const solPriceBn = new BN(Math.round(solPriceUsd * 1e9));
          const ssPriceBn = calcShortsolPrice(pool.k, solPriceBn);
          return Number(ssPriceBn.toString()) / 1e9;
        })()
      : 0;

  // Obligations & coverage
  const obligations = circulatingHuman * shortsolPriceUsd;
  const coverageRatio = obligations > 0 ? vaultBalanceUsdc / obligations : 1;
  const coveragePct = coverageRatio * 100;

  // Circuit breaker
  const breakerSolPrice =
    vaultBalanceUsdc > 0 && circulatingHuman > 0
      ? (0.95 * circulatingHuman * kHuman) / vaultBalanceUsdc
      : 0;
  const breakerDropPct =
    solPriceUsd && breakerSolPrice > 0
      ? ((breakerSolPrice - solPriceUsd) / solPriceUsd) * 100
      : 0;
  const bufferUntilBreaker = obligations > 0
    ? vaultBalanceUsdc - obligations * 0.95
    : vaultBalanceUsdc;

  // Stress test rows
  const stressRows = solPriceUsd
    ? STRESS_DROPS.map((drop) => {
        const newSolPrice = solPriceUsd * (1 - drop);
        const newSsPrice =
          pool
            ? (() => {
                const bn = calcShortsolPrice(
                  pool.k,
                  new BN(Math.round(newSolPrice * 1e9))
                );
                return Number(bn.toString()) / 1e9;
              })()
            : 0;
        const newObligations = circulatingHuman * newSsPrice;
        const newCoverage =
          newObligations > 0 ? vaultBalanceUsdc / newObligations : 1;
        return {
          drop,
          solPrice: newSolPrice,
          ssPrice: newSsPrice,
          obligations: newObligations,
          coverage: newCoverage,
          breaker: newCoverage < 0.95,
        };
      })
    : [];

  // Liquidity calculator
  const requiredVault = calcRequiredLiquidity(targetTvl, maxDrop);
  const additionalNeeded = calcLiquidityGap(targetTvl, maxDrop, fee);
  const overcollat = 1 / (1 - maxDrop);
  const dailyBuffer = calcDailyFeeBuffer(dailyVolume, fee);
  const daysToFund = calcDaysToSelfFund(
    Math.max(additionalNeeded, 0),
    dailyBuffer
  );
  const requiredVol90 = calcRequiredVolume(targetTvl, maxDrop, fee, 90);

  // AMM simulator calculations
  const ammVol = ammDailyVol / 100;
  const ammFee = ammFeePct / 100;
  const protocolFeeDecimal = fee;
  const dailyArbVol = calcArbVolume(ammPoolSize, ammVol);
  const dailyIL = calcDailyIL(ammPoolSize, ammVol);
  const dailyAmmRevenue = calcAmmFeeRevenue(dailyArbVol, ammFee);
  const dailyProtocolRevenue = calcProtocolFeeRevenue(dailyArbVol, protocolFeeDecimal);
  const monthlyIL = dailyIL * 30;
  const monthlyAmmRevenue = dailyAmmRevenue * 30;
  const monthlyProtocolRevenue = dailyProtocolRevenue * 30;
  const netLpPnl = monthlyAmmRevenue - monthlyIL;
  const breakevenFee = calcBreakevenAmmFee(ammVol);
  const lpRoiAnnual = ammPoolSize > 0 ? ((dailyAmmRevenue - dailyIL) * 365 / ammPoolSize) * 100 : 0;
  const protocolRoiAnnual = ammPoolSize > 0 ? (dailyProtocolRevenue * 365 / ammPoolSize) * 100 : 0;

  const VOL_SCENARIOS = [2, 3, 5, 8];
  const ammScenarioRows = VOL_SCENARIOS.map((v) => {
    const sigma = v / 100;
    const arbV = calcArbVolume(ammPoolSize, sigma);
    const il = calcDailyIL(ammPoolSize, sigma) * 30;
    const rev = calcAmmFeeRevenue(arbV, ammFee) * 30;
    const protRev = calcProtocolFeeRevenue(arbV, protocolFeeDecimal) * 30;
    const net = rev - il;
    const beF = calcBreakevenAmmFee(sigma) * 100;
    return { vol: v, arbVolDay: arbV, ilMonth: il, revMonth: rev, protRevMonth: protRev, net, breakevenFeePct: beF };
  });

  const coverageColor =
    coveragePct >= 100
      ? "vault-green"
      : coveragePct >= 95
        ? "vault-yellow"
        : "vault-red";

  return (
    <div className="form-card risk-dashboard">
      <h3>Risk Dashboard</h3>
      <p className="form-desc">
        Pool solvency analysis and liquidity planning
      </p>

      {/* Section A: Pool Status */}
      <div className="risk-section">
        <h4>Pool Status</h4>
        {pool && solPriceUsd ? (
          <>
            <div className="risk-rows">
              <div className="risk-row">
                <span>Vault Balance</span>
                <span>${fmtNum(vaultBalanceUsdc)}</span>
              </div>
              <div className="risk-row">
                <span>Obligations</span>
                <span>${fmtNum(obligations)}</span>
              </div>
              <div className="risk-row">
                <span>Circulating</span>
                <span>{circulatingHuman.toFixed(4)} {POOLS[poolId]?.name ?? "sSol"}</span>
              </div>
              <div className="risk-row">
                <span>Total Minted / Redeemed</span>
                <span>{totalMintedHuman.toFixed(2)} / {totalRedeemedHuman.toFixed(2)}</span>
              </div>
              <div className="risk-row">
                <span>Fees Collected</span>
                <span>${fmtNum(feesCollected)}</span>
              </div>
              <div className="risk-row">
                <span>K</span>
                <span>{fmtNum(kHuman)}</span>
              </div>
              <div className="risk-row">
                <span>Oracle Price</span>
                <span>
                  ${oraclePriceUsd.toFixed(2)}
                  <span className={oracleAge > 60 ? "negative" : "positive"} style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>
                    ({oracleAge}s ago)
                  </span>
                </span>
              </div>
              <div className="risk-row">
                <span>Fee</span>
                <span>{pool.feeBps} bps ({(pool.feeBps / 100).toFixed(2)}%)</span>
              </div>
              <div className="risk-row">
                <span>Program</span>
                <span>
                  <a href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    {programIdShort}
                  </a>
                </span>
              </div>
              <div className="risk-row">
                <span>Status</span>
                <span className={pool.paused ? "negative" : "positive"}>
                  {pool.paused ? "PAUSED" : "Active"}
                </span>
              </div>
            </div>
            <div className="risk-coverage">
              <div className="risk-row">
                <span>Coverage Ratio</span>
                <span className={coverageColor}>
                  {coveragePct.toFixed(1)}%
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className={`progress-fill ${coverageColor}`}
                  style={{ width: `${Math.min(coveragePct, 100)}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="risk-empty">Connect wallet to see pool data</p>
        )}
      </div>

      {/* Section B: Circuit Breaker */}
      {pool && solPriceUsd && circulatingHuman > 0 && (
        <div className="risk-section">
          <h4>Circuit Breaker Distance</h4>
          <div className="risk-rows">
            <div className="risk-row">
              <span>Current SOL</span>
              <span>${solPriceUsd.toFixed(2)}</span>
            </div>
            <div className="risk-row">
              <span>Breaker triggers at</span>
              <span className="negative">
                ${breakerSolPrice.toFixed(2)} ({breakerDropPct >= 0 ? "+" : ""}
                {breakerDropPct.toFixed(1)}%)
              </span>
            </div>
            <div className="risk-row">
              <span>Buffer until breaker</span>
              <span className={bufferUntilBreaker >= 0 ? "positive" : "negative"}>
                ${fmtNum(bufferUntilBreaker)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Section C: Stress Test */}
      {stressRows.length > 0 && (
        <div className="risk-section">
          <h4>Stress Test</h4>
          <div className="stress-header">
            <span>SOL Drop</span>
            <span>SOL $</span>
            <span>sSol $</span>
            <span>Oblig.</span>
            <span>Cover</span>
            <span>Status</span>
          </div>
          {stressRows.map((r) => (
            <div
              key={r.drop}
              className={`stress-row ${r.breaker ? "stress-danger" : ""}`}
            >
              <span>-{(r.drop * 100).toFixed(0)}%</span>
              <span>${r.solPrice.toFixed(0)}</span>
              <span>${r.ssPrice.toFixed(0)}</span>
              <span>${fmtNum(r.obligations)}</span>
              <span className={r.coverage >= 0.95 ? "positive" : "negative"}>
                {(r.coverage * 100).toFixed(0)}%
              </span>
              <span className={r.breaker ? "negative" : "positive"}>
                {r.breaker ? "BREAK" : "OK"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Section D: Add Liquidity */}
      {pool && (
        <div className="risk-section">
          <h4>Add Liquidity</h4>
          <div className="risk-inputs" style={{ gridTemplateColumns: "1fr" }}>
            <div className="risk-input-group">
              <label>USDC Amount</label>
              <input
                type="number"
                min="1"
                step="100"
                value={liqAmount}
                onChange={(e) => setLiqAmount(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <button
            disabled={txLoading || liqAmount <= 0}
            onClick={async () => {
              setLiqSuccess(null);
              setLiqError(null);
              try {
                const sig = await addLiquidity(
                  usdcToLamports(liqAmount),
                  USDC_MINT_PK
                );
                setLiqSuccess(sig);
                setTimeout(refreshPool, 2000);
              } catch (e: any) {
                setLiqError(e.message);
              }
            }}
          >
            {txLoading ? "Processing..." : `Add ${liqAmount} USDC`}
          </button>
          {liqSuccess && (
            <p className="success">
              Added! <a href={`https://explorer.solana.com/tx/${liqSuccess}?cluster=devnet`} target="_blank" rel="noreferrer">View TX</a>
            </p>
          )}
          {(liqError || txError) && (
            <p className="error">{liqError || txError}</p>
          )}
        </div>
      )}

      {/* Section E: Admin Controls */}
      {pool && (
        <div className="risk-section">
          <h4>Admin Controls</h4>

          <div className="admin-control-group">
            <div className="admin-control-row">
              <span className="admin-control-label">
                Pool is {pool.paused ? "paused" : "active"}
              </span>
              <button
                className={`admin-btn ${pool.paused ? "admin-btn-green" : "admin-btn-red"}`}
                disabled={txLoading}
                onClick={async () => {
                  setPauseSuccess(null);
                  setPauseError(null);
                  const action = pool.paused ? "unpause" : "pause";
                  if (!window.confirm(`Are you sure you want to ${action} the pool? This will ${pool.paused ? "re-enable" : "prevent"} all mints and redeems.`)) return;
                  try {
                    const sig = await setPause(!pool.paused);
                    setPauseSuccess(sig);
                    setTimeout(refreshPool, 2000);
                  } catch (e: any) {
                    setPauseError(e.message);
                  }
                }}
              >
                {txLoading ? "Processing..." : pool.paused ? "Unpause Pool" : "Pause Pool"}
              </button>
            </div>
            {pauseSuccess && (
              <p className="success">
                Done! <a href={`https://explorer.solana.com/tx/${pauseSuccess}?cluster=devnet`} target="_blank" rel="noreferrer">View TX</a>
              </p>
            )}
            {pauseError && <p className="error">{pauseError}</p>}
          </div>

          <div className="admin-control-group">
            <div className="admin-control-row">
              <span className="admin-control-label">
                K = {fmtNum(kHuman)}
              </span>
              <div className="admin-k-input">
                <input
                  type="number"
                  placeholder="New K (human, e.g. 7216)"
                  value={newKInput}
                  onChange={(e) => setNewKInput(e.target.value)}
                  disabled={circulatingHuman > 0}
                />
                <button
                  className="admin-btn"
                  disabled={txLoading || circulatingHuman > 0 || !newKInput}
                  onClick={async () => {
                    setKSuccess(null);
                    setKError(null);
                    if (!window.confirm(`Are you sure you want to update K to ${newKInput}? This changes the pricing formula.`)) return;
                    try {
                      const kBn = new BN(Math.round(parseFloat(newKInput) * 1e9).toString());
                      const sig = await updateK(kBn);
                      setKSuccess(sig);
                      setNewKInput("");
                      setTimeout(refreshPool, 2000);
                    } catch (e: any) {
                      setKError(e.message);
                    }
                  }}
                >
                  {txLoading ? "..." : "Update K"}
                </button>
              </div>
            </div>
            {circulatingHuman > 0 && (
              <p className="admin-warning">Update K only works when circulating = 0</p>
            )}
            {kSuccess && (
              <p className="success">
                Updated! <a href={`https://explorer.solana.com/tx/${kSuccess}?cluster=devnet`} target="_blank" rel="noreferrer">View TX</a>
              </p>
            )}
            {kError && <p className="error">{kError}</p>}
          </div>
        </div>
      )}

      {/* Section G: AMM Pool Simulator */}
      <div className="risk-section">
        <h4>AMM Pool Simulator</h4>
        <p className="form-desc">
          SOL/shortSOL liquidity pool — arb volume &amp; IL analysis
        </p>

        <div className="risk-inputs">
          <div className="risk-input-group">
            <label>Pool Size ($)</label>
            <input
              type="number"
              min="1000"
              step="10000"
              value={ammPoolSize}
              onChange={(e) => setAmmPoolSize(Number(e.target.value) || 0)}
            />
          </div>
          <div className="risk-input-group">
            <label>SOL Daily Vol (%)</label>
            <input
              type="number"
              min="0.5"
              max="20"
              step="0.5"
              value={ammDailyVol}
              onChange={(e) => setAmmDailyVol(Number(e.target.value) || 0)}
            />
          </div>
          <div className="risk-input-group">
            <label>AMM Fee (%)</label>
            <input
              type="number"
              min="0.01"
              max="5"
              step="0.05"
              value={ammFeePct}
              onChange={(e) => setAmmFeePct(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="risk-results">
          <div className="risk-result-row">
            <span>Arb Volume / day</span>
            <span>${fmtNum(dailyArbVol)}</span>
          </div>
          <div className="risk-result-divider" />
          <div className="risk-result-row">
            <span>LP Fee Revenue / mo</span>
            <span className="positive">${fmtNum(monthlyAmmRevenue)}</span>
          </div>
          <div className="risk-result-row">
            <span>IL / mo</span>
            <span className="negative">-${fmtNum(monthlyIL)}</span>
          </div>
          <div className={`risk-result-row risk-result-highlight`}>
            <span>Net LP PnL / mo</span>
            <span className={netLpPnl >= 0 ? "positive" : "negative"}>
              {netLpPnl >= 0 ? "" : "-"}${fmtNum(Math.abs(netLpPnl))}
            </span>
          </div>
          <div className="risk-result-divider" />
          <div className="risk-result-row risk-result-highlight">
            <span>Protocol Revenue / mo</span>
            <span className="positive">${fmtNum(monthlyProtocolRevenue)}</span>
          </div>
          <div className="risk-result-divider" />
          <div className="risk-result-row">
            <span>Break-even AMM Fee</span>
            <span className={ammFeePct / 100 >= breakevenFee ? "positive" : "negative"}>
              {(breakevenFee * 100).toFixed(2)}%
            </span>
          </div>
          <div className="risk-result-row">
            <span>LP ROI (annual)</span>
            <span className={lpRoiAnnual >= 0 ? "positive" : "negative"}>
              {lpRoiAnnual.toFixed(1)}%
            </span>
          </div>
          <div className="risk-result-row">
            <span>Protocol ROI (annual)</span>
            <span className="positive">{protocolRoiAnnual.toFixed(1)}%</span>
          </div>
        </div>

        <h4 style={{ marginTop: "1rem" }}>Volatility Scenarios</h4>
        <div className="stress-header amm-scenario-header">
          <span>σ daily</span>
          <span>Arb/day</span>
          <span>LP Fee/mo</span>
          <span>IL/mo</span>
          <span>Net LP</span>
          <span>Proto/mo</span>
        </div>
        {ammScenarioRows.map((r) => (
          <div
            key={r.vol}
            className={`stress-row ${r.net < 0 ? "stress-danger" : ""}`}
          >
            <span>{r.vol}%</span>
            <span>${fmtNum(r.arbVolDay)}</span>
            <span className="positive">${fmtNum(r.revMonth)}</span>
            <span className="negative">-${fmtNum(r.ilMonth)}</span>
            <span className={r.net >= 0 ? "positive" : "negative"}>
              {r.net >= 0 ? "" : "-"}${fmtNum(Math.abs(r.net))}
            </span>
            <span className="positive">${fmtNum(r.protRevMonth)}</span>
          </div>
        ))}
        <p className="form-desc" style={{ marginTop: "0.5rem" }}>
          Break-even AMM fee for {ammDailyVol}% vol: {(breakevenFee * 100).toFixed(2)}%.
          {ammFeePct >= breakevenFee * 100
            ? " Current fee covers IL ✓"
            : ` Need ${((breakevenFee * 100) - ammFeePct).toFixed(2)}% more or higher vol`}
        </p>
      </div>

      {/* Section E+F: Liquidity Calculator */}
      <div className="risk-section">
        <h4>Liquidity Calculator</h4>

        <div className="preset-buttons">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`preset-btn ${maxDrop === p.drop ? "preset-active" : ""}`}
              onClick={() => setMaxDrop(p.drop)}
            >
              {p.label} (-{(p.drop * 100).toFixed(0)}%)
            </button>
          ))}
        </div>

        <div className="risk-inputs">
          <div className="risk-input-group">
            <label>Target TVL ($)</label>
            <input
              type="number"
              min="1000"
              step="10000"
              value={targetTvl}
              onChange={(e) => setTargetTvl(Number(e.target.value) || 0)}
            />
          </div>
          <div className="risk-input-group">
            <label>Protection (SOL drop %)</label>
            <input
              type="number"
              min="5"
              max="99"
              value={Math.round(maxDrop * 100)}
              onChange={(e) =>
                setMaxDrop(Math.min(0.99, (Number(e.target.value) || 0) / 100))
              }
            />
          </div>
          <div className="risk-input-group">
            <label>Daily Volume ($)</label>
            <input
              type="number"
              min="0"
              step="10000"
              value={dailyVolume}
              onChange={(e) => setDailyVolume(Number(e.target.value) || 0)}
            />
          </div>
          <div className="risk-input-group">
            <label>Fee (bps)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={feeBps}
              onChange={(e) => setFeeBps(Number(e.target.value) || 4)}
            />
          </div>
        </div>

        <div className="risk-results">
          <div className="risk-result-row risk-result-highlight">
            <span>Required Vault</span>
            <span>${fmtNum(requiredVault)}</span>
          </div>
          <div className="risk-result-row">
            <span>From user mints</span>
            <span>${fmtNum(targetTvl)}</span>
          </div>
          <div className="risk-result-row risk-result-highlight">
            <span>Additional Needed</span>
            <span className="negative">${fmtNum(Math.max(additionalNeeded, 0))}</span>
          </div>
          <div className="risk-result-row">
            <span>Overcollat ratio</span>
            <span>{overcollat.toFixed(2)}x</span>
          </div>

          <div className="risk-result-divider" />

          <div className="risk-result-row">
            <span>Fee buffer / day</span>
            <span>${fmtNum(dailyBuffer)}</span>
          </div>
          <div className="risk-result-row">
            <span>Days to self-fund</span>
            <span>
              {daysToFund === Infinity
                ? "N/A"
                : `${fmtNum(daysToFund)} days`}
            </span>
          </div>
          <div className="risk-result-row">
            <span>Vol needed (90d self-fund)</span>
            <span>${fmtNum(requiredVol90)}/day</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(2) + "M";
  }
  if (Math.abs(n) >= 1_000) {
    return (n / 1_000).toFixed(1) + "K";
  }
  return n.toFixed(2);
}
