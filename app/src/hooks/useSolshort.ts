import { useCallback, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import BN from "bn.js";
import {
  getProgram,
  derivePoolPda,
  deriveShortsolMintPda,
  deriveMintAuthPda,
  deriveVaultPda,
  POOL_ID,
} from "../utils/program";

const HERMES_URL = "https://hermes.pyth.network";
const SOL_USD_FEED_ID =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

/** Fetch fresh price update VAA from Hermes */
async function fetchPriceUpdateData(): Promise<string[]> {
  const resp = await fetch(
    `${HERMES_URL}/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}&encoding=base64`
  );
  if (!resp.ok) throw new Error(`Hermes API error: ${resp.status}`);
  const data = await resp.json();
  return data.binary.data;
}

export function useSolshort() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [txSig, setTxSig] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mint = useCallback(
    async (usdcAmount: BN, usdcMint: PublicKey) => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();
        const [shortsolMint] = deriveShortsolMintPda();
        const [mintAuth] = deriveMintAuthPda();
        const [vaultUsdc] = deriveVaultPda(usdcMint);

        const userUsdc = await getAssociatedTokenAddress(
          usdcMint,
          wallet.publicKey
        );
        const userShortsol = await getAssociatedTokenAddress(
          shortsolMint,
          wallet.publicKey
        );

        // Pre-instructions: create ATA if needed
        const preIxs: ReturnType<typeof createAssociatedTokenAccountInstruction>[] = [];
        const ataInfo = await connection.getAccountInfo(userShortsol);
        if (!ataInfo) {
          preIxs.push(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey,
              userShortsol,
              wallet.publicKey,
              shortsolMint
            )
          );
        }

        // Fetch fresh price update from Hermes
        const priceFeedUpdateData = await fetchPriceUpdateData();

        // Build transaction: postPriceUpdate + mint
        const pythReceiver = new PythSolanaReceiver({
          connection,
          wallet: wallet as any,
        });

        const txBuilder = pythReceiver.newTransactionBuilder({
          closeUpdateAccounts: false,
        });
        await txBuilder.addPostPriceUpdates(priceFeedUpdateData);

        let priceUpdateAccount: PublicKey;
        await txBuilder.addPriceConsumerInstructions(
          async (getPriceUpdateAccount) => {
            try {
              priceUpdateAccount = getPriceUpdateAccount(
                "0x" + SOL_USD_FEED_ID
              );
            } catch {
              priceUpdateAccount = getPriceUpdateAccount(SOL_USD_FEED_ID);
            }

            const mintIx = await (program.methods as any)
              .mint(POOL_ID, usdcAmount)
              .accounts({
                poolState: poolPda,
                vaultUsdc,
                shortsolMint,
                mintAuthority: mintAuth,
                priceUpdate: priceUpdateAccount,
                usdcMint,
                userUsdc,
                userShortsol,
                user: wallet.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
              })
              .instruction();

            return [
              ...preIxs.map((ix) => ({ instruction: ix, signers: [] })),
              { instruction: mintIx, signers: [] },
            ];
          }
        );

        // Build versioned transactions
        const txs = await txBuilder.buildVersionedTransactions({
          tightComputeBudget: false,
        });

        // Sign and send
        const lastSig = await signAndSendVersionedTxs(
          txs,
          wallet,
          connection
        );

        setTxSig(lastSig);
        return lastSig;
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet]
  );

  const redeem = useCallback(
    async (shortsolAmount: BN, usdcMint: PublicKey) => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();
        const [shortsolMint] = deriveShortsolMintPda();
        const [vaultUsdc] = deriveVaultPda(usdcMint);

        const userUsdc = await getAssociatedTokenAddress(
          usdcMint,
          wallet.publicKey
        );
        const userShortsol = await getAssociatedTokenAddress(
          shortsolMint,
          wallet.publicKey
        );

        // Fetch fresh price update from Hermes
        const priceFeedUpdateData = await fetchPriceUpdateData();

        const pythReceiver = new PythSolanaReceiver({
          connection,
          wallet: wallet as any,
        });

        const txBuilder = pythReceiver.newTransactionBuilder({
          closeUpdateAccounts: false,
        });
        await txBuilder.addPostPriceUpdates(priceFeedUpdateData);

        let priceUpdateAccount: PublicKey;
        await txBuilder.addPriceConsumerInstructions(
          async (getPriceUpdateAccount) => {
            try {
              priceUpdateAccount = getPriceUpdateAccount(
                "0x" + SOL_USD_FEED_ID
              );
            } catch {
              priceUpdateAccount = getPriceUpdateAccount(SOL_USD_FEED_ID);
            }

            const redeemIx = await (program.methods as any)
              .redeem(POOL_ID, shortsolAmount)
              .accounts({
                poolState: poolPda,
                vaultUsdc,
                shortsolMint,
                priceUpdate: priceUpdateAccount,
                usdcMint,
                userShortsol,
                userUsdc,
                user: wallet.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
              })
              .instruction();

            return [{ instruction: redeemIx, signers: [] }];
          }
        );

        const txs = await txBuilder.buildVersionedTransactions({
          tightComputeBudget: false,
        });

        const lastSig = await signAndSendVersionedTxs(
          txs,
          wallet,
          connection
        );

        setTxSig(lastSig);
        return lastSig;
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet]
  );

  const addLiquidity = useCallback(
    async (usdcAmount: BN, usdcMint: PublicKey) => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();
        const [vaultUsdc] = deriveVaultPda(usdcMint);

        const authorityUsdc = await getAssociatedTokenAddress(
          usdcMint,
          wallet.publicKey
        );

        const sig = await (program.methods as any)
          .addLiquidity(POOL_ID, usdcAmount)
          .accounts({
            poolState: poolPda,
            vaultUsdc,
            usdcMint,
            authorityUsdc,
            authority: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        await connection.confirmTransaction(sig, "confirmed");
        setTxSig(sig);
        return sig;
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet]
  );

  const setPause = useCallback(
    async (paused: boolean) => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();

        const sig = await (program.methods as any)
          .setPause(POOL_ID, paused)
          .accounts({
            poolState: poolPda,
            authority: wallet.publicKey,
          })
          .rpc();

        await connection.confirmTransaction(sig, "confirmed");
        setTxSig(sig);
        return sig;
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet]
  );

  const updateK = useCallback(
    async (newK: BN) => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();

        const sig = await (program.methods as any)
          .updateK(POOL_ID, newK)
          .accounts({
            poolState: poolPda,
            authority: wallet.publicKey,
          })
          .rpc();

        await connection.confirmTransaction(sig, "confirmed");
        setTxSig(sig);
        return sig;
      } catch (e: any) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [connection, wallet]
  );

  return { mint, redeem, addLiquidity, setPause, updateK, txSig, loading, error };
}

/** Sign and send versioned transactions sequentially */
async function signAndSendVersionedTxs(
  txs: any[],
  wallet: any,
  connection: any
): Promise<string> {
  let lastSig = "";
  for (const entry of txs) {
    const vtx: VersionedTransaction = entry.tx || entry;
    const ephemeralSigners: Keypair[] = entry.signers || [];

    // Ephemeral signers sign first
    if (ephemeralSigners.length > 0) {
      vtx.sign(ephemeralSigners);
    }

    // Wallet signs
    const signed = await wallet.signTransaction(vtx);

    // Send
    const sig = await connection.sendTransaction(signed);
    await connection.confirmTransaction(sig, "confirmed");
    lastSig = sig;
  }
  return lastSig;
}
