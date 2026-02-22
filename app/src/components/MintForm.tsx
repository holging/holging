import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSolshort } from "../hooks/useSolshort";
import { usdcToLamports } from "../utils/math";

interface MintFormProps {
  usdcMint: string | null;
  onSuccess?: () => void;
}

export function MintForm({ usdcMint, onSuccess }: MintFormProps) {
  const [amount, setAmount] = useState("");
  const { mint, loading, error, txSig } = useSolshort();

  const handleMint = async () => {
    if (!amount || !usdcMint) return;
    const lamports = usdcToLamports(parseFloat(amount));
    await mint(lamports, new PublicKey(usdcMint));
    onSuccess?.();
  };

  return (
    <div className="form-card">
      <h3>Mint shortSOL</h3>
      <p className="form-desc">Deposit USDC to receive shortSOL tokens</p>
      <div className="input-group">
        <input
          type="number"
          placeholder="USDC amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
        />
        <span className="input-suffix">USDC</span>
      </div>
      <button onClick={handleMint} disabled={loading || !amount || !usdcMint}>
        {loading ? "Minting..." : "Mint shortSOL"}
      </button>
      {error && <p className="error">{error}</p>}
      {txSig && (
        <p className="success">
          TX:{" "}
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {txSig.slice(0, 16)}...
          </a>
        </p>
      )}
    </div>
  );
}
