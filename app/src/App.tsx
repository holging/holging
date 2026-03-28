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
import { LpDashboard } from "./components/LpDashboard";
import { usePool } from "./hooks/usePool";
import { usePythPrice } from "./hooks/usePythPrice";

const USDC_MINT: string =
  import.meta.env.VITE_USDC_MINT || "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn";
const USDC_MINT_PK = new PublicKey(USDC_MINT);
const ADMIN_WALLETS = (
  import.meta.env.VITE_ADMIN_WALLETS ||
  "66HBrTxNii7eFzSTgo8mUzsij3FM7xC2L9jE2H89sDYs,FLbSeegx6UqXx4doXbtoWWoKBxRoFLrBTmQcoyeXsxjq"
).split(",");

// Default PublicKey (all zeros) — LP not initialized
const DEFAULT_PUBKEY = "11111111111111111111111111111111";

type Tab = "mint" | "redeem" | "lp" | "holging" | "holders" | "state" | "risk";

function App() {
  const { connected, publicKey } = useWallet();
  const { pool, error: poolError } = usePool();
  const { solPriceUsd } = usePythPrice();
  const [tab, setTab] = useState<Tab>("mint");

  const lpInitialized = pool?.lpMint && pool.lpMint !== "" && pool.lpMint !== DEFAULT_PUBKEY;

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
          {lpInitialized && (
            <button
              className={tab === "lp" ? "active" : ""}
              onClick={() => setTab("lp")}
            >
              LP
            </button>
          )}
          <button
            className={tab === "holging" ? "active" : ""}
            onClick={() => setTab("holging")}
          >
            Holging
          </button>
          <button
            className={tab === "holders" ? "active" : ""}
            onClick={() => setTab("holders")}
          >
            Holders
          </button>
          <button
            className={tab === "state" ? "active" : ""}
            onClick={() => setTab("state")}
          >
            State
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

        {tab === "mint" && (
          <>
            <FaucetButton />
            <MintForm usdcMint={USDC_MINT} />
          </>
        )}
        {tab === "redeem" && <RedeemForm usdcMint={USDC_MINT} />}
        {tab === "lp" && lpInitialized && (
          <LpDashboard
            pool={pool}
            solPriceUsd={solPriceUsd ?? 0}
            usdcMint={USDC_MINT_PK}
          />
        )}
        {tab === "holging" && <StrategyTerminal />}
        {tab === "holders" && <TokenHolders />}
        {tab === "state" && <StatePage />}
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
