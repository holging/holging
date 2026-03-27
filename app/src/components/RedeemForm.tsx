import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { useSolshort } from "../hooks/useSolshort";
import { shortsolToLamports, calcDynamicFee } from "../utils/math";
import { deriveShortsolMintPda } from "../utils/program";
import { usePool } from "../hooks/usePool";
import { usePythPrice } from "../hooks/usePythPrice";
import BN from "bn.js";

interface RedeemFormProps {
  usdcMint: string | null;
  onSuccess?: () => void;
}

export function RedeemForm({ usdcMint, onSuccess }: RedeemFormProps) {
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<number>(0);
  const { redeem, loading, error, txSig } = useSolshort();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { pool } = usePool();
  const { solPriceUsd: solPrice } = usePythPrice();

  const dynamicFeeBps = pool && solPrice
    ? calcDynamicFee(
        new BN(pool.feeBps), new BN(pool.vaultBalance),
        new BN(pool.circulating), new BN(pool.k), new BN(Math.round(solPrice * 1e9))
      ).toNumber()
    : null;

  const fetchBalance = useCallback(async () => {
    if (!wallet?.publicKey) return;
    try {
      const [shortsolMint] = deriveShortsolMintPda();
      const ata = await getAssociatedTokenAddress(
        shortsolMint,
        wallet.publicKey
      );
      const acc = await getAccount(connection, ata);
      setBalance(Number(acc.amount) / 1e9);
    } catch {
      setBalance(0);
    }
  }, [connection, wallet]);

  useEffect(() => {
    fetchBalance();
    const id = setInterval(fetchBalance, 15_000);
    return () => clearInterval(id);
  }, [fetchBalance]);

  const parsed = parseFloat(amount);
  const isValid = amount !== "" && isFinite(parsed) && parsed > 0 && parsed <= balance;

  const handleRedeem = async () => {
    if (!isValid || !usdcMint) return;
    const lamports = shortsolToLamports(parsed);
    await redeem(lamports, new PublicKey(usdcMint));
    setAmount("");
    fetchBalance();
    onSuccess?.();
  };

  return (
    <div className="form-card">
      <h3>Redeem shortSOL</h3>
      <p className="form-desc">
        Burn shortSOL tokens to receive USDC
        {dynamicFeeBps !== null && ` | Fee: ${(dynamicFeeBps / 100).toFixed(2)}%`}
      </p>
      <div className="input-group">
        <input
          type="number"
          placeholder="shortSOL amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.0001"
          aria-label="shortSOL amount to redeem"
        />
        <button
          className="max-btn"
          onClick={() => setAmount(balance > 0 ? balance.toFixed(4) : "")}
          disabled={balance <= 0}
          type="button"
        >
          Max
        </button>
        <span className="input-suffix">shortSOL</span>
      </div>
      {balance > 0 && (
        <p className="balance-hint">Balance: {balance.toFixed(4)} shortSOL</p>
      )}
      {amount && !isValid && parsed > balance && (
        <p className="error">Exceeds balance</p>
      )}
      {amount && !isValid && parsed <= 0 && (
        <p className="error">Amount must be positive</p>
      )}
      <button onClick={handleRedeem} disabled={loading || !isValid || !usdcMint}>
        {loading ? "Redeeming..." : "Redeem USDC"}
      </button>
      {error && <p className="error">{error}</p>}
      {txSig && (
        <p className="success">
          Redeemed successfully!{" "}
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View TX
          </a>
        </p>
      )}
    </div>
  );
}
