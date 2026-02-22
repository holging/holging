import { useState } from "react";
import { usePythPrice } from "../hooks/usePythPrice";
import { usePool } from "../hooks/usePool";
import BN from "bn.js";
import { calcShortsolPrice, calcHolgingPnl } from "../utils/math";

export function HolgingCalculator() {
  const [priceChange, setPriceChange] = useState(0);
  const [investment, setInvestment] = useState(1000);
  const { solPriceUsd } = usePythPrice();
  const { pool } = usePool();

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
  const shortsolPart = multiplier > 0 ? half * (1 / multiplier) : 0;
  const total = solPart + shortsolPart;
  const pnl = multiplier > 0 ? calcHolgingPnl(multiplier) : 0;

  // New prices after change
  const newSolPrice = solPriceUsd ? solPriceUsd * multiplier : null;
  const newShortsolPrice =
    shortsolPriceUsd && multiplier > 0
      ? shortsolPriceUsd / multiplier
      : null;

  const scenarios = [
    { label: "-50%", mult: 0.5 },
    { label: "-25%", mult: 0.75 },
    { label: "-10%", mult: 0.9 },
    { label: "0%", mult: 1.0 },
    { label: "+10%", mult: 1.1 },
    { label: "+25%", mult: 1.25 },
    { label: "+50%", mult: 1.5 },
    { label: "+100%", mult: 2.0 },
  ];

  return (
    <div className="form-card">
      <h3>Holging Calculator</h3>
      <p className="form-desc">
        50% SOL + 50% shortSOL portfolio performance
      </p>

      <div className="input-group">
        <input
          type="number"
          min="100"
          step="100"
          value={investment}
          onChange={(e) => setInvestment(Number(e.target.value) || 0)}
        />
        <span className="input-suffix">USDC</span>
      </div>

      <div className="input-group">
        <input
          type="range"
          min="-90"
          max="200"
          value={priceChange}
          onChange={(e) => setPriceChange(Number(e.target.value))}
        />
        <span className="slider-label">
          SOL price change: {priceChange > 0 ? "+" : ""}
          {priceChange}%
        </span>
      </div>

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

      <div className="pnl-result">
        <span>Portfolio P&L:</span>
        <span className={pnl >= 0 ? "positive" : "negative"}>
          {pnl >= 0 ? "+" : ""}
          {(pnl * 100).toFixed(2)}%
          {investment > 0 && (
            <span className="pnl-usd">
              {" "}({total - investment >= 0 ? "+" : ""}${(total - investment).toFixed(2)})
            </span>
          )}
        </span>
      </div>

      <div className="scenarios">
        <h4>Scenarios (${investment})</h4>
        <div className="scenario-header">
          <span>SOL</span>
          <span>SOL P&L</span>
          <span>sSol P&L</span>
          <span>Total</span>
          <span>Net P&L</span>
        </div>
        {scenarios.map((s) => {
          const sv = half * s.mult;
          const ssv = half * (1 / s.mult);
          const t = sv + ssv;
          const solPnl = sv - half;
          const ssolPnl = ssv - half;
          const netPnl = t - investment;
          return (
            <div key={s.label} className="scenario-row scenario-detailed">
              <span>{s.label}</span>
              <span className={solPnl >= 0 ? "positive" : "negative"}>
                {solPnl >= 0 ? "+" : ""}${solPnl.toFixed(0)}
              </span>
              <span className={ssolPnl >= 0 ? "positive" : "negative"}>
                {ssolPnl >= 0 ? "+" : ""}${ssolPnl.toFixed(0)}
              </span>
              <span>${t.toFixed(0)}</span>
              <span className={netPnl >= 0 ? "positive" : "negative"}>
                {netPnl >= 0 ? "+" : ""}${netPnl.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
