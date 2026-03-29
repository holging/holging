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
import { POOLS, POOL_IDS, DEFAULT_POOL_ID } from "./config/pools";

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
  const [selectedPoolId, setSelectedPoolId] = useState(DEFAULT_POOL_ID);
  const { pool, error: poolError } = usePool(selectedPoolId);
  const { solPriceUsd } = usePythPrice(POOLS[selectedPoolId]?.feedId);
  const [tab, setTab] = useState<Tab>("mint");

  const selectedPool = POOLS[selectedPoolId];
  const lpInitialized = pool?.lpMint && pool.lpMint !== "" && pool.lpMint !== DEFAULT_PUBKEY;

  const walletAddr = publicKey?.toBase58();
  const isAdmin =
    (walletAddr && ADMIN_WALLETS.includes(walletAddr)) ||
    (pool && walletAddr && pool.authority === walletAddr);

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>Holging</h1>
          <span className="tagline">Tokenized Hedge Protocol</span>
        </div>
        <WalletMultiButton />
      </header>

      <main>
        {/* Pool Selector */}
        <div className="pool-selector">
          {POOL_IDS.map((id) => (
            <button
              key={id}
              className={`pool-btn ${selectedPoolId === id ? "active" : ""}`}
              onClick={() => setSelectedPoolId(id)}
            >
              <span className="pool-icon">{POOLS[id].icon}</span>
              <span className="pool-name">{POOLS[id].name}</span>
            </button>
          ))}
        </div>

        <PriceDisplay poolId={selectedPoolId} />

        {connected && <PositionCard poolId={selectedPoolId} />}

        {connected && <PortfolioView usdcMint={USDC_MINT} poolId={selectedPoolId} />}

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
        {tab === "risk" && isAdmin && <RiskDashboard poolId={selectedPoolId} />}

        {poolError && selectedPoolId === DEFAULT_POOL_ID && (
          <div className="info-banner">
            Pool not initialized yet. Deploy to devnet and run initialize-pool
            script first.
          </div>
        )}
        {poolError && selectedPoolId !== DEFAULT_POOL_ID && (
          <div className="info-banner">
            {selectedPool.name} pool not initialized yet on devnet.
          </div>
        )}
      </main>

      <footer>
        <p>Holging Protocol - Devnet</p>
      </footer>
    </div>
  );
}

export default App;
