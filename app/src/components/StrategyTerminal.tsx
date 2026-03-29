import { useState, useMemo } from "react";
import { usePythPrice } from "../hooks/usePythPrice";
import { usePool } from "../hooks/usePool";
import { POOLS, DEFAULT_POOL_ID } from "../config/pools";
import BN from "bn.js";
import {
  calcShortsolPrice,
  calcHolgingPnl,
  calcHolgingPnlWithFees,
  calcHolgingGreeks,
  calcBreakeven,
  generateChartPoints,
} from "../utils/math";

export function StrategyTerminal({ poolId = DEFAULT_POOL_ID }: { poolId?: string }) {
  const [investmentStr, setInvestmentStr] = useState("1000");
  const investment = Number(investmentStr) || 0;
  const [priceChange, setPriceChange] = useState(0);
  const { solPriceUsd } = usePythPrice(POOLS[poolId]?.feedId);
  const { pool } = usePool(poolId);

  const feeBps = pool?.feeBps ?? 4;
  const multiplier = 1 + priceChange / 100;

  // Current shortSOL price in USD
  const shortsolPriceUsd =
    pool && solPriceUsd
      ? (() => {
          const solPriceBn = new BN(Math.round(solPriceUsd * 1e9));
          const ssPriceBn = calcShortsolPrice(pool.k, solPriceBn);
          return Number(ssPriceBn.toString()) / 1e9;
        })()
      : null;

  // Portfolio breakdown
  const half = investment / 2;
  const solPart = half * multiplier;
  const shortsolPart = multiplier > 0 ? half / multiplier : 0;
  const total = solPart + shortsolPart;

  // P&L
  const grossPnl = calcHolgingPnl(multiplier);
  const netPnl = calcHolgingPnlWithFees(multiplier, feeBps);

  // Greeks
  const { delta, gamma } = calcHolgingGreeks(multiplier);

  // Break-even
  const { lower: beLower, upper: beUpper } = calcBreakeven(feeBps);
  const beRangeLower = ((beLower - 1) * 100).toFixed(1);
  const beRangeUpper = ((beUpper - 1) * 100).toFixed(1);

  // Prices after change
  const newSolPrice = solPriceUsd ? solPriceUsd * multiplier : null;
  const newShortsolPrice =
    shortsolPriceUsd && multiplier > 0
      ? shortsolPriceUsd / multiplier
      : null;

  // Chart data
  const chartPoints = useMemo(
    () => generateChartPoints(60, feeBps),
    [feeBps]
  );

  const maxPnl = useMemo(
    () => Math.max(...chartPoints.map((p) => p.pnl)),
    [chartPoints]
  );

  // Build clip-path polygons for chart
  const grossPolygon = useMemo(() => {
    const pts = chartPoints.map((pt, i) => {
      const xPct = (i / (chartPoints.length - 1)) * 100;
      const yPct = 100 - (pt.pnl / maxPnl) * 90;
      return `${xPct}% ${yPct}%`;
    });
    return `polygon(0% 100%, ${pts.join(", ")}, 100% 100%)`;
  }, [chartPoints, maxPnl]);

  const netPolygon = useMemo(() => {
    const pts = chartPoints.map((pt, i) => {
      const xPct = (i / (chartPoints.length - 1)) * 100;
      const yPct = 100 - (Math.max(0, pt.pnlWithFees) / maxPnl) * 90;
      return `${xPct}% ${yPct}%`;
    });
    return `polygon(0% 100%, ${pts.join(", ")}, 100% 100%)`;
  }, [chartPoints, maxPnl]);

  // Indicator position on chart
  const indicatorX = useMemo(() => {
    const xMin = 0.1;
    const xMax = 3.0;
    return ((multiplier - xMin) / (xMax - xMin)) * 100;
  }, [multiplier]);

  const indicatorY = useMemo(() => {
    return 100 - (grossPnl / maxPnl) * 90;
  }, [grossPnl, maxPnl]);

  // Scenarios
  const scenarios = [
    { label: "-90%", mult: 0.1 },
    { label: "-75%", mult: 0.25 },
    { label: "-50%", mult: 0.5 },
    { label: "-25%", mult: 0.75 },
    { label: "-10%", mult: 0.9 },
    { label: "0%", mult: 1.0 },
    { label: "+10%", mult: 1.1 },
    { label: "+25%", mult: 1.25 },
    { label: "+50%", mult: 1.5 },
    { label: "+100%", mult: 2.0 },
    { label: "+200%", mult: 3.0 },
  ];

  // Strategy comparison values
  const holdSolValue = investment * multiplier;
  const holdUsdcValue = investment;
  const holdSolPnl = ((multiplier - 1) * 100).toFixed(2);
  const holgingPnl = (grossPnl * 100).toFixed(2);

  const isProfitable = netPnl > 0;
  const roundtripFeePct = ((2 * feeBps) / 100).toFixed(2);

  return (
    <div className="form-card strategy-terminal">
      <h3>Strategy Terminal</h3>
      <p className="terminal-subtitle">
        HOLGING: 50% SOL + 50% shortSOL
      </p>

      {/* Investment Input */}
      <div className="input-group">
        <input
          type="number"
          min="100"
          step="100"
          value={investmentStr}
          onChange={(e) => setInvestmentStr(e.target.value)}
        />
        <span className="input-suffix">USDC</span>
      </div>

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">SOL Price</div>
          <div className="metric-value">
            {solPriceUsd ? `$${solPriceUsd.toFixed(2)}` : "..."}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Portfolio Value</div>
          <div className={`metric-value ${total >= investment ? "positive" : "negative"}`}>
            ${total.toFixed(2)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Delta</div>
          <div className="metric-value">{delta.toFixed(4)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Gamma</div>
          <div className="metric-value metric-accent">{gamma.toFixed(4)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Break-even</div>
          <div className="metric-value metric-dim">
            {beRangeLower}% / +{beRangeUpper}%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Net P&L</div>
          <div className={`metric-value ${isProfitable ? "positive" : "negative"}`}>
            {netPnl >= 0 ? "+" : ""}
            {(netPnl * 100).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* V-Curve Chart */}
      <div className="terminal-chart">
        <div className="chart-title">P&L Curve (V-Shape)</div>
        <div className="chart-container">
          <div className="chart-y-axis">
            <span>{(maxPnl * 100).toFixed(0)}%</span>
            <span>{((maxPnl / 2) * 100).toFixed(0)}%</span>
            <span>0%</span>
          </div>
          <div className="chart-area">
            <div
              className="chart-fill-gross"
              style={{ clipPath: grossPolygon }}
            />
            <div
              className="chart-fill-net"
              style={{ clipPath: netPolygon }}
            />
            {indicatorX >= 0 && indicatorX <= 100 && (
              <>
                <div
                  className="chart-indicator"
                  style={{ left: `${indicatorX}%` }}
                />
                <div
                  className="chart-indicator-dot"
                  style={{
                    left: `${indicatorX}%`,
                    top: `${indicatorY}%`,
                  }}
                />
              </>
            )}
          </div>
        </div>
        <div className="chart-x-axis">
          <span>-90%</span>
          <span>-50%</span>
          <span>0%</span>
          <span>+100%</span>
          <span>+200%</span>
        </div>

        {/* Slider */}
        <div className="chart-slider">
          <input
            type="range"
            min="-90"
            max="200"
            value={priceChange}
            onChange={(e) => setPriceChange(Number(e.target.value))}
          />
          <span className="slider-label">
            SOL price: {priceChange > 0 ? "+" : ""}
            {priceChange}%
            {newSolPrice && (
              <span className="slider-price"> (${newSolPrice.toFixed(2)})</span>
            )}
          </span>
        </div>
      </div>

      {/* Strategy Comparison */}
      <div className="strategy-compare">
        <div className="compare-col compare-highlight">
          <h5>Holging</h5>
          <div className={`compare-value ${total >= investment ? "positive" : ""}`}>
            ${total.toFixed(0)}
          </div>
          <div className={`compare-pnl ${grossPnl >= 0 ? "positive" : "negative"}`}>
            {grossPnl >= 0 ? "+" : ""}
            {holgingPnl}%
          </div>
          <div className="compare-note">Always wins</div>
        </div>
        <div className="compare-col">
          <h5>Hold SOL</h5>
          <div className={`compare-value ${holdSolValue >= investment ? "positive" : "negative"}`}>
            ${holdSolValue.toFixed(0)}
          </div>
          <div className={`compare-pnl ${multiplier >= 1 ? "positive" : "negative"}`}>
            {multiplier >= 1 ? "+" : ""}
            {holdSolPnl}%
          </div>
          <div className="compare-note">Full exposure</div>
        </div>
        <div className="compare-col">
          <h5>Hold USDC</h5>
          <div className="compare-value">${holdUsdcValue.toFixed(0)}</div>
          <div className="compare-pnl">0.00%</div>
          <div className="compare-note">Zero return</div>
        </div>
      </div>

      {/* Token Breakdown */}
      {solPriceUsd && shortsolPriceUsd && (
        <div className="token-breakdown">
          <div className="breakdown-header">
            <span></span>
            <span>Price</span>
            <span>Value</span>
            <span>P&L</span>
          </div>
          <div className="breakdown-row">
            <span className="token-name">SOL</span>
            <span className="token-price">
              ${solPriceUsd.toFixed(2)} → ${newSolPrice?.toFixed(2)}
            </span>
            <span>${solPart.toFixed(2)}</span>
            <span className={solPart - half >= 0 ? "positive" : "negative"}>
              {solPart - half >= 0 ? "+" : ""}${(solPart - half).toFixed(2)}
            </span>
          </div>
          <div className="breakdown-row">
            <span className="token-name">shortSOL</span>
            <span className="token-price">
              ${shortsolPriceUsd.toFixed(2)} → ${newShortsolPrice?.toFixed(2)}
            </span>
            <span>${shortsolPart.toFixed(2)}</span>
            <span className={shortsolPart - half >= 0 ? "positive" : "negative"}>
              {shortsolPart - half >= 0 ? "+" : ""}${(shortsolPart - half).toFixed(2)}
            </span>
          </div>
          <div className="breakdown-row breakdown-total">
            <span className="token-name">Total</span>
            <span></span>
            <span>${total.toFixed(2)}</span>
            <span className={total - investment >= 0 ? "positive" : "negative"}>
              {total - investment >= 0 ? "+" : ""}${(total - investment).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Scenario Table */}
      <div className="scenarios">
        <h4>Scenarios (${investment.toLocaleString()})</h4>
        <div className="scenario-enhanced-wrapper">
          <div className="scenario-enhanced-header">
            <span>SOL</span>
            <span>SOL Val</span>
            <span>sSol Val</span>
            <span>Total</span>
            <span>P&L</span>
            <span>Net</span>
          </div>
          {scenarios.map((s) => {
            const sv = half * s.mult;
            const ssv = half / s.mult;
            const t = sv + ssv;
            const pnl = calcHolgingPnl(s.mult);
            const net = calcHolgingPnlWithFees(s.mult, feeBps);
            const inFeeZone = net < 0;
            return (
              <div
                key={s.label}
                className={`scenario-enhanced-row ${inFeeZone ? "scenario-fee-zone" : ""}`}
              >
                <span>{s.label}</span>
                <span>${sv.toFixed(0)}</span>
                <span>${ssv.toFixed(0)}</span>
                <span>${t.toFixed(0)}</span>
                <span className={pnl >= 0 ? "positive" : "negative"}>
                  +{(pnl * 100).toFixed(1)}%
                </span>
                <span className={net >= 0 ? "positive" : "negative"}>
                  {net >= 0 ? "+" : ""}
                  {(net * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fee Impact */}
      <div className="fee-analysis">
        <h4>Fee Impact</h4>
        <div className="fee-row">
          <span>Mint fee</span>
          <span>{(feeBps / 100).toFixed(2)}%</span>
        </div>
        <div className="fee-row">
          <span>Redeem fee</span>
          <span>{(feeBps / 100).toFixed(2)}%</span>
        </div>
        <div className="fee-row">
          <span>Roundtrip</span>
          <span>{roundtripFeePct}%</span>
        </div>
        <div className="fee-row">
          <span>Break-even range</span>
          <span>
            {beRangeLower}% / +{beRangeUpper}%
          </span>
        </div>
        <div
          className={`fee-status ${isProfitable ? "fee-status-profitable" : "fee-status-zone"}`}
        >
          <span>{isProfitable ? "PROFITABLE" : "WITHIN FEE ZONE"}</span>
          <span>
            Current move: {priceChange > 0 ? "+" : ""}
            {priceChange}%
          </span>
        </div>
      </div>
    </div>
  );
}
