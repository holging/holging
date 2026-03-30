import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BurnerWalletAdapter } from "../utils/BurnerWalletAdapter";

/**
 * BurnerFunder — info bar for burner wallet with faucet link.
 */
export function BurnerFunder() {
  const { wallet, publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [solBalance, setSolBalance] = useState<number | null>(null);

  const isBurner = wallet?.adapter instanceof BurnerWalletAdapter;

  // Fetch SOL balance
  useEffect(() => {
    if (!publicKey || !connected) {
      setSolBalance(null);
      return;
    }
    let cancelled = false;
    const fetchBal = async () => {
      try {
        const bal = await connection.getBalance(publicKey);
        if (!cancelled) setSolBalance(bal / LAMPORTS_PER_SOL);
      } catch {
        if (!cancelled) setSolBalance(null);
      }
    };
    fetchBal();
    const id = setInterval(fetchBal, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection, publicKey, connected]);

  if (!isBurner || !connected || !publicKey) return null;

  const addr = publicKey.toBase58();
  const short = addr.slice(0, 4) + "..." + addr.slice(-4);
  const needsSol = solBalance !== null && solBalance < 0.01;

  return (
    <div className="burner-bar">
      <span className="burner-badge">🔥 Burner</span>
      <span className="burner-addr" title={addr}>{short}</span>
      {solBalance !== null && (
        <span className="burner-balance">
          {solBalance.toFixed(4)} SOL
        </span>
      )}
      {needsSol && (
        <a
          className="burner-faucet-link"
          href="https://faucet.solana.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get SOL ↗
        </a>
      )}
      <button
        className="burner-reset-btn"
        onClick={() => {
          BurnerWalletAdapter.resetBurnerWallet();
          window.location.reload();
        }}
        title="Wipe this burner wallet and generate a new one"
      >
        🗑️ Reset
      </button>
    </div>
  );
}
