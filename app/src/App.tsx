import { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { PriceDisplay } from "./components/PriceDisplay";
import { PositionCard } from "./components/PositionCard";
import { MintForm } from "./components/MintForm";
import { RedeemForm } from "./components/RedeemForm";
import { PortfolioView } from "./components/PortfolioView";
import { StrategyTerminal } from "./components/StrategyTerminal";
import { RiskDashboard } from "./components/RiskDashboard";
import { usePool } from "./hooks/usePool";

// Fake USDC on devnet (6 decimals)
const USDC_MINT: string | null = "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn";
const ADMIN_WALLETS = [
  "66HBrTxNii7eFzSTgo8mUzsij3FM7xC2L9jE2H89sDYs",
  "FLbSeegx6UqXx4doXbtoWWoKBxRoFLrBTmQcoyeXsxjq",
];

type Tab = "mint" | "redeem" | "holging" | "risk";

function App() {
  const { connected, publicKey } = useWallet();
  const { pool, error: poolError } = usePool();
  const [tab, setTab] = useState<Tab>("mint");

  const walletAddr = publicKey?.toBase58();
  const isAdmin =
    (walletAddr && ADMIN_WALLETS.includes(walletAddr)) ||
    (pool && walletAddr && pool.authority === walletAddr);

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>SolShort</h1>
          <span className="tagline">Tokenized Hedge Protocol</span>
        </div>
        <WalletMultiButton />
      </header>

      <main>
        <PriceDisplay />

        {connected && <PositionCard />}

        {connected && <PortfolioView usdcMint={USDC_MINT} />}

        <div className="tabs">
          <button
            className={tab === "mint" ? "active" : ""}
            onClick={() => setTab("mint")}
          >
            Mint
          </button>
          <button
            className={tab === "redeem" ? "active" : ""}
            onClick={() => setTab("redeem")}
          >
            Redeem
          </button>
          <button
            className={tab === "holging" ? "active" : ""}
            onClick={() => setTab("holging")}
          >
            Holging
          </button>
          {isAdmin && (
            <button
              className={tab === "risk" ? "active" : ""}
              onClick={() => setTab("risk")}
            >
              Risk
            </button>
          )}
        </div>

        {tab === "mint" && <MintForm usdcMint={USDC_MINT} />}
        {tab === "redeem" && <RedeemForm usdcMint={USDC_MINT} />}
        {tab === "holging" && <StrategyTerminal />}
        {tab === "risk" && isAdmin && <RiskDashboard />}

        {poolError && (
          <div className="info-banner">
            Pool not initialized yet. Deploy to devnet and run initialize-pool
            script first.
          </div>
        )}
      </main>

      <footer>
        <p>SolShort Protocol - Devnet</p>
      </footer>
    </div>
  );
}

export default App;
