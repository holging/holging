import { useEffect, useRef, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BurnerWalletAdapter } from "../utils/BurnerWalletAdapter";

/**
 * BurnerFunder — auto-airdrops SOL to a newly created burner wallet.
 * Renders a small info bar when a burner wallet is connected.
 */
export function BurnerFunder() {
  const { wallet, publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [status, setStatus] = useState<"idle" | "funding" | "done" | "error">("idle");
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const attempted = useRef(false);

  const isBurner = wallet?.adapter instanceof BurnerWalletAdapter;

  // Fetch SOL balance
  useEffect(() => {
    if (!publicKey || !connected) {
      setSolBalance(null);
      return;
    }
    let cancelled = false;
    const fetch = async () => {
      try {
        const bal = await connection.getBalance(publicKey);
        if (!cancelled) setSolBalance(bal / LAMPORTS_PER_SOL);
      } catch {
        if (!cancelled) setSolBalance(null);
      }
    };
    fetch();
    const id = setInterval(fetch, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection, publicKey, connected, status]);

  // Auto-airdrop if balance is 0
  useEffect(() => {
    if (!isBurner || !publicKey || !connected || attempted.current) return;
    if (solBalance === null) return; // still loading
    if (solBalance >= 0.01) {
      setStatus("done");
      return; // already has SOL
    }

    attempted.current = true;
    setStatus("funding");

    (async () => {
      try {
        // Request 2 SOL airdrop (devnet max per request)
        const sig = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig, "confirmed");
        setStatus("done");
        setSolBalance(2);
      } catch (err: any) {
        console.warn("Airdrop failed:", err.message);
        setStatus("error");
      }
    })();
  }, [isBurner, publicKey, connected, solBalance, connection]);

  // Reset on disconnect
  useEffect(() => {
    if (!connected) {
      attempted.current = false;
      setStatus("idle");
    }
  }, [connected]);

  if (!isBurner || !connected || !publicKey) return null;

  const addr = publicKey.toBase58();
  const short = addr.slice(0, 4) + "..." + addr.slice(-4);

  return (
    <div className="burner-bar">
      <span className="burner-badge">🔥 Burner</span>
      <span className="burner-addr" title={addr}>{short}</span>
      {solBalance !== null && (
        <span className="burner-balance">
          {solBalance.toFixed(4)} SOL
        </span>
      )}
      {status === "funding" && <span className="burner-status airdropping">Airdropping SOL...</span>}
      {status === "error" && (
        <span className="burner-status error">
          Airdrop failed — try{" "}
          <a href="https://faucet.solana.com/" target="_blank" rel="noopener noreferrer">
            faucet.solana.com
          </a>
        </span>
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
