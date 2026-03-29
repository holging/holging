import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { useSolshort } from "../hooks/useSolshort";
import { usdcToLamports, calcDynamicFee } from "../utils/math";
import { usePool } from "../hooks/usePool";
import { usePythPrice } from "../hooks/usePythPrice";
import { POOLS, DEFAULT_POOL_ID } from "../config/pools";
import BN from "bn.js";

interface MintFormProps {
  usdcMint: string | null;
  poolId?: string;
  onSuccess?: () => void;
}

export function MintForm({ usdcMint, poolId = DEFAULT_POOL_ID, onSuccess }: MintFormProps) {
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<number>(0);
  const { mint, loading, error, txSig } = useSolshort(poolId);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { pool } = usePool(poolId);
  const { solPriceUsd: solPrice } = usePythPrice(POOLS[poolId]?.feedId);

  const dynamicFeeBps = pool && solPrice
    ? calcDynamicFee(
        new BN(pool.feeBps), new BN(pool.vaultBalance),
        new BN(pool.circulating), new BN(pool.k), new BN(Math.round(solPrice * 1e9))
      ).toNumber()
    : null;

  const fetchBalance = useCallback(async () => {
    if (!wallet?.publicKey || !usdcMint) return;
    try {
      const ata = await getAssociatedTokenAddress(
        new PublicKey(usdcMint),
        wallet.publicKey
      );
      const acc = await getAccount(connection, ata);
      setBalance(Number(acc.amount) / 1e6);
    } catch {
      setBalance(0);
    }
  }, [connection, wallet, usdcMint]);

  useEffect(() => {
    fetchBalance();
    const id = setInterval(fetchBalance, 15_000);
    return () => clearInterval(id);
  }, [fetchBalance]);

  const parsed = parseFloat(amount);
  const isValid = amount !== "" && isFinite(parsed) && parsed > 0 && parsed <= balance;

  const handleMint = async () => {
    if (!isValid || !usdcMint) return;
    const lamports = usdcToLamports(parsed);
    await mint(lamports, new PublicKey(usdcMint));
    setAmount("");
    fetchBalance();
    onSuccess?.();
  };

  return (
    <div className="form-card">
      <h3>Mint {POOLS[poolId]?.name ?? "shortSOL"}</h3>
      <p className="form-desc">
        Deposit USDC to receive {POOLS[poolId]?.name ?? "shortSOL"} tokens
        {dynamicFeeBps !== null && ` | Fee: ${(dynamicFeeBps / 100).toFixed(2)}%`}
      </p>
      <div className="input-group">
        <input
          type="number"
          placeholder="USDC amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
          aria-label="USDC amount to mint"
        />
        <button
          className="max-btn"
          onClick={() => setAmount(balance > 0 ? balance.toFixed(2) : "")}
          disabled={balance <= 0}
          type="button"
        >
          Max
        </button>
        <span className="input-suffix">USDC</span>
      </div>
      {balance > 0 && (
        <p className="balance-hint">Balance: {balance.toFixed(2)} USDC</p>
      )}
      {amount && !isValid && parsed > balance && (
        <p className="error">Exceeds balance</p>
      )}
      {amount && !isValid && parsed <= 0 && (
        <p className="error">Amount must be positive</p>
      )}
      <button onClick={handleMint} disabled={loading || !isValid || !usdcMint}>
        {loading ? "Minting..." : `Mint ${POOLS[poolId]?.name ?? "shortSOL"}`}
      </button>
      {error && <p className="error">{error}</p>}
      {txSig && (
        <p className="success">
          Minted successfully!{" "}
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
