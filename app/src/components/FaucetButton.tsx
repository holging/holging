import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export function FaucetButton() {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    if (!publicKey) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const resp = await fetch("/.netlify/functions/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Faucet error");
      setResult(data.signature);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey) return null;

  return (
    <div className="faucet-bar">
      <button
        className="faucet-btn"
        onClick={handleClaim}
        disabled={loading}
      >
        {loading ? "Claiming..." : "Get 5,000 Test USDC"}
      </button>
      {result && (
        <span className="faucet-success">
          Claimed!{" "}
          <a href={`https://explorer.solana.com/tx/${result}?cluster=devnet`} target="_blank" rel="noopener noreferrer">
            TX
          </a>
        </span>
      )}
      {error && <span className="faucet-error">{error}</span>}
    </div>
  );
}
