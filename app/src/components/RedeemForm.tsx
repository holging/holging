import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSolshort } from "../hooks/useSolshort";
import { shortsolToLamports } from "../utils/math";

interface RedeemFormProps {
  usdcMint: string | null;
  onSuccess?: () => void;
}

export function RedeemForm({ usdcMint, onSuccess }: RedeemFormProps) {
  const [amount, setAmount] = useState("");
  const { redeem, loading, error, txSig } = useSolshort();

  const handleRedeem = async () => {
    if (!amount || !usdcMint) return;
    const lamports = shortsolToLamports(parseFloat(amount));
    await redeem(lamports, new PublicKey(usdcMint));
    onSuccess?.();
  };

  return (
    <div className="form-card">
      <h3>Redeem shortSOL</h3>
      <p className="form-desc">Burn shortSOL tokens to receive USDC</p>
      <div className="input-group">
        <input
          type="number"
          placeholder="shortSOL amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.0001"
        />
        <span className="input-suffix">shortSOL</span>
      </div>
      <button onClick={handleRedeem} disabled={loading || !amount || !usdcMint}>
        {loading ? "Redeeming..." : "Redeem USDC"}
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
