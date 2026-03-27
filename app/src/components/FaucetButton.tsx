import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import faucetIdl from "../faucet_idl.json";

const FAUCET_PROGRAM_ID = new PublicKey("BqisdDoAVUH8KH2uAspUfCYSiiAwdLvuEepk1R8A7hGn");
const USDC_MINT = new PublicKey("CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn");

const [faucetState] = PublicKey.findProgramAddressSync(
  [Buffer.from("faucet")],
  FAUCET_PROGRAM_ID
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  FAUCET_PROGRAM_ID
);

export function FaucetButton() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    if (!publicKey) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const [claimRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from("claim"), publicKey.toBuffer()],
        FAUCET_PROGRAM_ID
      );

      const userAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);

      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey } as any,
        { commitment: "confirmed" }
      );
      const program = new anchor.Program(faucetIdl as any, provider);

      const tx = new Transaction();

      // Create user ATA if needed
      const ataInfo = await connection.getAccountInfo(userAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            userAta,
            publicKey,
            USDC_MINT
          )
        );
      }

      // Add claim instruction
      const claimIx = await (program.methods as any)
        .claim()
        .accounts({
          user: publicKey,
          faucetState,
          vault,
          claimRecord,
          userAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      tx.add(claimIx);

      const sig = await sendTransaction(tx, connection, {
        skipPreflight: false,
      });
      await connection.confirmTransaction(sig, "confirmed");
      setResult(sig);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("RateLimited") || msg.includes("0x1770")) {
        setError("Already claimed today. Come back in 24 hours.");
      } else if (msg.includes("VaultEmpty") || msg.includes("0x1771")) {
        setError("Vault is empty. Contact admin.");
      } else {
        setError(msg);
      }
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
          <a
            href={`https://explorer.solana.com/tx/${result}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
          >
            TX
          </a>
        </span>
      )}
      {error && <span className="faucet-error">{error}</span>}
    </div>
  );
}
