import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { deriveShortsolMintPda } from "../utils/program";
import { usePool } from "../hooks/usePool";
import { usePythPrice } from "../hooks/usePythPrice";
import { calcShortsolPrice, SHORTSOL_DECIMALS, USDC_DECIMALS } from "../utils/math";
import BN from "bn.js";

interface PortfolioViewProps {
  usdcMint: string | null;
}

export function PortfolioView({ usdcMint }: PortfolioViewProps) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { pool } = usePool();
  const { solPriceUsd } = usePythPrice();
  const [usdcBalance, setUsdcBalance] = useState<BN | null>(null);
  const [shortsolBalance, setShortsolBalance] = useState<BN | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) return;

    const fetchBalances = async () => {
      // SOL balance
      const sol = await connection.getBalance(publicKey);
      setSolBalance(sol / 1e9);

      // USDC balance
      if (usdcMint) {
        try {
          const usdcAta = await getAssociatedTokenAddress(
            new PublicKey(usdcMint),
            publicKey
          );
          const usdcAcc = await getAccount(connection, usdcAta);
          setUsdcBalance(new BN(usdcAcc.amount.toString()));
        } catch {
          setUsdcBalance(new BN(0));
        }
      }

      // shortSOL balance
      try {
        const [shortsolMint] = deriveShortsolMintPda();
        const shortsolAta = await getAssociatedTokenAddress(
          shortsolMint,
          publicKey
        );
        const shortsolAcc = await getAccount(connection, shortsolAta);
        setShortsolBalance(new BN(shortsolAcc.amount.toString()));
      } catch {
        setShortsolBalance(new BN(0));
      }
    };

    fetchBalances();
    const id = setInterval(fetchBalances, 10000);
    return () => clearInterval(id);
  }, [connection, publicKey, usdcMint]);

  if (!publicKey) return null;

  // Calculate USD values
  const solNum = solBalance ?? 0;
  const usdcNum = usdcBalance
    ? Number(usdcBalance.toString()) / 10 ** USDC_DECIMALS
    : 0;
  const shortsolNum = shortsolBalance
    ? Number(shortsolBalance.toString()) / 10 ** SHORTSOL_DECIMALS
    : 0;

  let shortsolPriceUsd = 0;
  if (pool && solPriceUsd) {
    const solPriceBn = new BN(Math.round(solPriceUsd * 1e9));
    const ssPriceBn = calcShortsolPrice(pool.k, solPriceBn);
    shortsolPriceUsd = Number(ssPriceBn.toString()) / 1e9;
  }

  const solValueUsd = solNum * (solPriceUsd ?? 0);
  const usdcValueUsd = usdcNum;
  const shortsolValueUsd = shortsolNum * shortsolPriceUsd;
  const totalUsd = solValueUsd + usdcValueUsd + shortsolValueUsd;

  const formatUsd = (v: number) =>
    v >= 1000
      ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      : `$${v.toFixed(2)}`;

  return (
    <div className="portfolio">
      <h3>Portfolio</h3>
      <div className="balance-row">
        <span className="balance-asset">SOL</span>
        <span className="balance-amount">{solBalance?.toFixed(4) ?? "—"}</span>
        <span className="balance-usd">{solPriceUsd ? formatUsd(solValueUsd) : "—"}</span>
      </div>
      <div className="balance-row">
        <span className="balance-asset">USDC</span>
        <span className="balance-amount">
          {usdcBalance
            ? usdcNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : "—"}
        </span>
        <span className="balance-usd">{usdcBalance ? formatUsd(usdcValueUsd) : "—"}</span>
      </div>
      <div className="balance-row">
        <span className="balance-asset">shortSOL</span>
        <span className="balance-amount">
          {shortsolBalance ? shortsolNum.toFixed(4) : "—"}
        </span>
        <span className="balance-usd">
          {shortsolBalance && shortsolPriceUsd ? formatUsd(shortsolValueUsd) : "—"}
        </span>
      </div>
      <div className="balance-row balance-total">
        <span className="balance-asset">Total</span>
        <span className="balance-amount"></span>
        <span className="balance-usd">{formatUsd(totalUsd)}</span>
      </div>
    </div>
  );
}
