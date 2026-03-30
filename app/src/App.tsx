import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { PriceDisplay } from "./components/PriceDisplay";
import { PositionCard } from "./components/PositionCard";
import { MintForm } from "./components/MintForm";
import { RedeemForm } from "./components/RedeemForm";
import { PortfolioView } from "./components/PortfolioView";
import { StrategyTerminal } from "./components/StrategyTerminal";
import { RiskDashboard } from "./components/RiskDashboard";
import { TokenHolders } from "./components/TokenHolders";
import { StatePage } from "./components/StatePage";
import { FaucetButton } from "./components/FaucetButton";
import { BurnerFunder } from "./components/BurnerFunder";
import { McpPage } from "./components/McpPage";
import { LpDashboard } from "./components/LpDashboard";
import { usePool } from "./hooks/usePool";
import { usePythPrice } from "./hooks/usePythPrice";
import { POOLS, POOL_IDS, DEFAULT_POOL_ID } from "./config/pools";

const USDC_MINT: string =
  import.meta.env.VITE_USDC_MINT || "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn";
const USDC_MINT_PK = new PublicKey(USDC_MINT);
const ADMIN_WALLETS = (
  import.meta.env.VITE_ADMIN_WALLETS ||
  "66HBrTxNii7eFzSTgo8mUzsij3FM7xC2L9jE2H89sDYs,FLbSeegx6UqXx4doXbtoWWoKBxRoFLrBTmQcoyeXsxjq"
).split(",");

const DEFAULT_PUBKEY = "11111111111111111111111111111111";

type Tab = "mint" | "redeem" | "lp" | "holging" | "holders" | "state" | "mcp" | "risk";

const TAB_META: Record<Tab, { label: string; icon: string; primary?: boolean }> = {
  mint:    { label: "Mint",    icon: "💰", primary: true },
  redeem:  { label: "Redeem",  icon: "🔄", primary: true },
  lp:      { label: "LP",      icon: "💧", primary: true },
  holging: { label: "Holging", icon: "📊", primary: true },
  holders: { label: "Holders", icon: "👥" },
  state:   { label: "State",   icon: "🔍" },
  mcp:     { label: "API",     icon: "⚡" },
  risk:    { label: "Risk",    icon: "🛡️" },
};

function App() {
  const { connected, publicKey } = useWallet();
  const [selectedPoolId, setSelectedPoolId] = useState(DEFAULT_POOL_ID);
  const { pool, error: poolError } = usePool(selectedPoolId);
  const { solPriceUsd } = usePythPrice(POOLS[selectedPoolId]?.feedId);
  const [tab, setTab] = useState<Tab>("mint");
  const [moreOpen, setMoreOpen] = useState(false);

  const selectedPool = POOLS[selectedPoolId];
  const lpInitialized = pool?.lpMint && pool.lpMint !== "" && pool.lpMint !== DEFAULT_PUBKEY;

  const walletAddr = publicKey?.toBase58();
  const isAdmin =
    (walletAddr && ADMIN_WALLETS.includes(walletAddr)) ||
    (pool && walletAddr && pool.authority === walletAddr);

  const visibleTabs: Tab[] = [
    "mint", "redeem",
    ...(lpInitialized ? ["lp" as Tab] : []),
    "holging", "holders", "state", "mcp",
    ...(isAdmin ? ["risk" as Tab] : []),
  ];

  // Primary tabs for bottom nav (mobile)
  const primaryTabs: Tab[] = ["mint", "redeem", ...(lpInitialized ? ["lp" as Tab] : []), "holging"];
  const secondaryTabs = visibleTabs.filter(t => !primaryTabs.includes(t));

  return (
    <div className="app">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <h1>Holging</h1>
          <span className="tagline">Tokenized Hedge Protocol</span>
        </div>

        <div className="header-pools">
          {POOL_IDS.map((id) => (
            <button
              key={id}
              className={`pool-chip ${selectedPoolId === id ? "active" : ""}`}
              onClick={() => setSelectedPoolId(id)}
            >
              <span className="pool-chip-icon">{POOLS[id].icon}</span>
              <span className="pool-chip-name">{POOLS[id].name}</span>
            </button>
          ))}
        </div>

        <div className="header-right">
          <span className="network-badge">Devnet</span>
          <WalletMultiButton />
        </div>
      </header>

      <BurnerFunder />

      {/* ── Main Layout ─────────────────────────────────────── */}
      <div className="layout">
        {/* ── Sidebar (desktop) ──────────────────────────────── */}
        <aside className="sidebar">
          <PriceDisplay poolId={selectedPoolId} />

          {connected && <PositionCard poolId={selectedPoolId} />}
          {connected && <PortfolioView usdcMint={USDC_MINT} poolId={selectedPoolId} />}

          <div className="sidebar-links">
            <a href="https://github.com/holging/holging" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://github.com/holging/holging/tree/main/docs" target="_blank" rel="noopener noreferrer">Docs</a>
            <a href="https://api.holging.com" target="_blank" rel="noopener noreferrer">API</a>
          </div>
        </aside>

        {/* ── Content ────────────────────────────────────────── */}
        <main className="content">
          {/* Mobile-only: price row + pool selector are in header */}
          <div className="mobile-prices">
            <PriceDisplay poolId={selectedPoolId} />
          </div>

          {connected && (
            <div className="mobile-position">
              <PositionCard poolId={selectedPoolId} />
              <PortfolioView usdcMint={USDC_MINT} poolId={selectedPoolId} />
            </div>
          )}

          {/* Desktop/Tablet tab bar */}
          <div className="tabs">
            {visibleTabs.map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {TAB_META[t].label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="tab-content">
            {tab === "mint" && (
              <>
                <FaucetButton />
                <MintForm usdcMint={USDC_MINT} poolId={selectedPoolId} />
              </>
            )}
            {tab === "redeem" && <RedeemForm usdcMint={USDC_MINT} poolId={selectedPoolId} />}
            {tab === "lp" && lpInitialized && (
              <LpDashboard
                pool={pool}
                solPriceUsd={solPriceUsd ?? 0}
                usdcMint={USDC_MINT_PK}
                poolId={selectedPoolId}
              />
            )}
            {tab === "holging" && <StrategyTerminal poolId={selectedPoolId} />}
            {tab === "holders" && <TokenHolders poolId={selectedPoolId} />}
            {tab === "state" && <StatePage poolId={selectedPoolId} />}
            {tab === "mcp" && <McpPage />}
            {tab === "risk" && isAdmin && <RiskDashboard poolId={selectedPoolId} />}

            {poolError && selectedPoolId === DEFAULT_POOL_ID && (
              <div className="info-banner">
                Pool not initialized yet. Deploy to devnet and run initialize-pool script first.
              </div>
            )}
            {poolError && selectedPoolId !== DEFAULT_POOL_ID && (
              <div className="info-banner">
                {selectedPool.name} pool not initialized yet on devnet.
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Bottom Nav (mobile only) ────────────────────────── */}
      <nav className="bottom-nav">
        {primaryTabs.map((t) => (
          <button
            key={t}
            className={`bottom-nav-item ${tab === t ? "active" : ""}`}
            onClick={() => { setTab(t); setMoreOpen(false); }}
          >
            <span className="bottom-nav-icon">{TAB_META[t].icon}</span>
            <span className="bottom-nav-label">{TAB_META[t].label}</span>
          </button>
        ))}
        <div className="bottom-nav-more-wrapper">
          <button
            className={`bottom-nav-item ${secondaryTabs.includes(tab) ? "active" : ""}`}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <span className="bottom-nav-icon">⋯</span>
            <span className="bottom-nav-label">More</span>
          </button>
          {moreOpen && (
            <div className="bottom-nav-sheet">
              {secondaryTabs.map((t) => (
                <button
                  key={t}
                  className={`bottom-nav-sheet-item ${tab === t ? "active" : ""}`}
                  onClick={() => { setTab(t); setMoreOpen(false); }}
                >
                  <span>{TAB_META[t].icon}</span>
                  <span>{TAB_META[t].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* ── Footer (desktop/tablet only) ────────────────────── */}
      <footer className="footer">
        <p>
          Holging Protocol — Devnet
          <span className="footer-sep">·</span>
          <a href="https://github.com/holging" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
          <span className="footer-sep">·</span>
          <a href="https://github.com/holging/holging/tree/main/docs" target="_blank" rel="noopener noreferrer" className="footer-link">Docs</a>
        </p>
      </footer>
    </div>
  );
}

export default App;
