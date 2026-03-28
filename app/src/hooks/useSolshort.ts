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
  ASSOCIATED_TOKEN_PROGRAM_ID,
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
  deriveFundingConfigPda,
  deriveLpMintPda,
  deriveLpPositionPda,
  POOL_ID,
} from "../utils/program";
import { HERMES_URL, SOL_USD_FEED_ID, fetchSolPrice, pythPriceToPrecision } from "../utils/pyth";
import { calcShortsolPrice, calcMintTokens, calcRedeemUsdc, calcDynamicFee } from "../utils/math";

const SLIPPAGE_BPS = 100; // 1% default slippage tolerance
const BPS_DENOM = new BN(10_000);

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

            // Update cached price first (no deviation check)
            const updatePriceIx = await (program.methods as any)
              .updatePrice(POOL_ID)
              .accounts({
                poolState: poolPda,
                pythPrice: priceUpdateAccount,
                payer: wallet.publicKey,
              })
              .instruction();

            // Calculate slippage-protected minimum output
            const poolAcc = await (program.account as any).poolState.fetch(poolPda);
            const solPricePyth = await fetchSolPrice();
            const solPriceBn = new BN(pythPriceToPrecision(solPricePyth).toString());
            const shortsolPrice = calcShortsolPrice(new BN(poolAcc.k.toString()), solPriceBn);
            const dynamicFee = calcDynamicFee(
              new BN(poolAcc.feeBps), new BN(poolAcc.vaultBalance.toString()),
              new BN(poolAcc.circulating.toString()), new BN(poolAcc.k.toString()), solPriceBn
            );
            const { tokens: expectedTokens } = calcMintTokens(usdcAmount, shortsolPrice, dynamicFee);
            const minTokensOut = expectedTokens.mul(BPS_DENOM.sub(new BN(SLIPPAGE_BPS))).div(BPS_DENOM);

            const mintIx = await (program.methods as any)
              .mint(POOL_ID, usdcAmount, minTokensOut)
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
              { instruction: updatePriceIx, signers: [] },
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

            // Update cached price first (no deviation check)
            const updatePriceIx = await (program.methods as any)
              .updatePrice(POOL_ID)
              .accounts({
                poolState: poolPda,
                pythPrice: priceUpdateAccount,
                payer: wallet.publicKey,
              })
              .instruction();

            // Calculate slippage-protected minimum output
            const poolAcc = await (program.account as any).poolState.fetch(poolPda);
            const solPricePyth = await fetchSolPrice();
            const solPriceBn = new BN(pythPriceToPrecision(solPricePyth).toString());
            const shortsolPrice = calcShortsolPrice(new BN(poolAcc.k.toString()), solPriceBn);
            const dynamicFee = calcDynamicFee(
              new BN(poolAcc.feeBps), new BN(poolAcc.vaultBalance.toString()),
              new BN(poolAcc.circulating.toString()), new BN(poolAcc.k.toString()), solPriceBn
            );
            const { usdcOut: expectedUsdc } = calcRedeemUsdc(shortsolAmount, shortsolPrice, dynamicFee);
            const minUsdcOut = expectedUsdc.mul(BPS_DENOM.sub(new BN(SLIPPAGE_BPS))).div(BPS_DENOM);

            const redeemIx = await (program.methods as any)
              .redeem(POOL_ID, shortsolAmount, minUsdcOut)
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

            return [
              { instruction: updatePriceIx, signers: [] },
              { instruction: redeemIx, signers: [] },
            ];
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
        const [lpMint] = deriveLpMintPda();
        const [lpPosition] = deriveLpPositionPda(wallet.publicKey);

        const lpProviderUsdc = await getAssociatedTokenAddress(
          usdcMint,
          wallet.publicKey
        );
        const lpProviderLpAta = await getAssociatedTokenAddress(
          lpMint,
          wallet.publicKey
        );

        const sig = await (program.methods as any)
          .addLiquidity(POOL_ID, usdcAmount)
          .accounts({
            poolState: poolPda,
            vaultUsdc,
            lpMint,
            lpPosition,
            lpProviderLpAta,
            usdcMint,
            lpProviderUsdc,
            lpProvider: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
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

  const updatePrice = useCallback(
    async () => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();

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

            const updatePriceIx = await (program.methods as any)
              .updatePrice(POOL_ID)
              .accounts({
                poolState: poolPda,
                pythPrice: priceUpdateAccount,
                payer: wallet.publicKey,
              })
              .instruction();

            return [{ instruction: updatePriceIx, signers: [] }];
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

  const removeLiquidity = useCallback(
    async (lpSharesAmount: BN, usdcMint: PublicKey) => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();
        const [vaultUsdc] = deriveVaultPda(usdcMint);
        const [lpMint] = deriveLpMintPda();
        const [lpPosition] = deriveLpPositionPda(wallet.publicKey);

        const lpProviderUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
        const lpProviderLpAta = await getAssociatedTokenAddress(lpMint, wallet.publicKey);

        const priceFeedUpdateData = await fetchPriceUpdateData();
        const pythReceiver = new PythSolanaReceiver({ connection, wallet: wallet as any });
        const txBuilder = pythReceiver.newTransactionBuilder({ closeUpdateAccounts: false });
        await txBuilder.addPostPriceUpdates(priceFeedUpdateData);

        let priceUpdateAccount: PublicKey;
        await txBuilder.addPriceConsumerInstructions(async (getPriceUpdateAccount) => {
          try {
            priceUpdateAccount = getPriceUpdateAccount("0x" + SOL_USD_FEED_ID);
          } catch {
            priceUpdateAccount = getPriceUpdateAccount(SOL_USD_FEED_ID);
          }
          const ix = await (program.methods as any)
            .removeLiquidity(POOL_ID, lpSharesAmount)
            .accounts({
              poolState: poolPda,
              vaultUsdc,
              lpMint,
              lpPosition,
              lpProviderLpAta,
              usdcMint,
              lpProviderUsdc,
              priceUpdate: priceUpdateAccount,
              lpProvider: wallet.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .instruction();
          return [{ instruction: ix, signers: [] }];
        });

        const txs = await txBuilder.buildVersionedTransactions({ tightComputeBudget: false });
        const lastSig = await signAndSendVersionedTxs(txs, wallet, connection);
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

  const claimLpFees = useCallback(
    async (usdcMint: PublicKey) => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();
        const [vaultUsdc] = deriveVaultPda(usdcMint);
        const [lpPosition] = deriveLpPositionPda(wallet.publicKey);
        const lpProviderUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

        const sig = await (program.methods as any)
          .claimLpFees(POOL_ID)
          .accounts({
            poolState: poolPda,
            vaultUsdc,
            lpPosition,
            usdcMint,
            lpProviderUsdc,
            lpProvider: wallet.publicKey,
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

  const transferAuthority = useCallback(
    async (newAuthority: PublicKey) => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();

        const sig = await (program.methods as any)
          .transferAuthority(POOL_ID)
          .accounts({
            poolState: poolPda,
            authority: wallet.publicKey,
            newAuthority,
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

  const acceptAuthority = useCallback(
    async () => {
      if (!wallet) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const program = getProgram(connection, wallet);
        const [poolPda] = derivePoolPda();

        const sig = await (program.methods as any)
          .acceptAuthority(POOL_ID)
          .accounts({
            poolState: poolPda,
            newAuthority: wallet.publicKey,
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

  return {
    mint, redeem, addLiquidity, removeLiquidity, claimLpFees,
    transferAuthority, acceptAuthority, setPause, updateK, updatePrice,
    txSig, loading, error,
  };
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

    // Replace blockhash with a fresh one to avoid "Blockhash not found"
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    vtx.message.recentBlockhash = blockhash;

    // Ephemeral signers sign first
    if (ephemeralSigners.length > 0) {
      vtx.sign(ephemeralSigners);
    }

    // Wallet signs
    const signed = await wallet.signTransaction(vtx);

    // Send and confirm with expiry-based timeout (fails fast if tx expires)
    const sig = await connection.sendTransaction(signed);
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    lastSig = sig;
  }
  return lastSig;
}
