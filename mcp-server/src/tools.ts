import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import BN from "bn.js";

import { getConnection, getWallet, getProgram, getUsdcMint } from "./solana.js";
import {
  derivePoolPda, deriveShortsolMintPda, deriveMintAuthPda,
  deriveVaultPda, deriveFundingConfigPda, deriveLpMintPda, deriveLpPositionPda,
  fetchSolPrice, pythPriceToUsd, pythPriceToPrecision,
  calcShortsolPrice, formatUsdc, POOL_ID, PRICE_PRECISION,
} from "./utils.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendTx(tx: Transaction): Promise<string> {
  const conn = getConnection();
  const wallet = getWallet();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet.payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

/** Get the existing price_update account from pool's last oracle update.
 *  Mint/redeem use the on-chain cached price — no Pyth posting needed
 *  if update_price was called recently (by keeper or frontend). */
async function getCachedPriceUpdate(): Promise<PublicKey> {
  // Use pool state itself as price source — mint/redeem read from pool.last_oracle_price
  // The price_update account must be a valid PriceUpdateV2 — we use the one already posted
  const conn = getConnection();
  const program = getProgram();
  const [poolPda] = derivePoolPda();
  const pool: any = await (program.account as any).poolState.fetch(poolPda);

  // Find the most recent PriceUpdateV2 account owned by Pyth receiver
  // For simplicity, we'll post a fresh one via raw Anchor CPI
  // Actually, we need to use the Pyth pull oracle pattern without the SDK

  // Workaround: search for existing price update accounts
  // The Pyth receiver program creates ephemeral accounts — they expire
  // So we need to post fresh price data

  // Use Hermes HTTP API to get encoded update, then post via raw transaction
  const resp = await fetch(
    "https://hermes.pyth.network/v2/updates/price/latest?ids[]=ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d&encoding=hex"
  );
  const data: any = await resp.json();

  // For now, return pool PDA as placeholder — will use updatePrice only
  throw new Error("Direct Pyth posting requires PythSolanaReceiver SDK. Use updatePrice from frontend or keeper first.");
}

// ─── Read-only tools ─────────────────────────────────────────────────────────

export async function getPoolState(): Promise<string> {
  const program = getProgram();
  const [poolPda] = derivePoolPda();
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const solPrice = await fetchSolPrice();
  const solUsd = pythPriceToUsd(solPrice);
  const k = new BN(pool.k.toString());
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const shortsolPrice = calcShortsolPrice(k, solPriceBn);
  const shortsolUsd = shortsolPrice.toNumber() / 1e9;

  return JSON.stringify({
    pool: poolPda.toBase58(),
    vaultBalance: formatUsdc(new BN(pool.vaultBalance.toString())),
    vaultBalanceRaw: pool.vaultBalance.toString(),
    circulating: (new BN(pool.circulating.toString()).toNumber() / 1e9).toFixed(4) + " shortSOL",
    k: pool.k.toString(),
    feeBps: pool.feeBps,
    paused: pool.paused,
    authority: pool.authority.toBase58(),
    solPriceUsd: `$${solUsd.toFixed(2)}`,
    shortsolPriceUsd: `$${shortsolUsd.toFixed(2)}`,
    lpTotalSupply: pool.lpTotalSupply.toString(),
    lpPrincipal: formatUsdc(new BN(pool.lpPrincipal.toString())),
    totalLpFeesPending: formatUsdc(new BN(pool.totalLpFeesPending.toString())),
    totalFeesCollected: formatUsdc(new BN(pool.totalFeesCollected.toString())),
    minLpDeposit: formatUsdc(new BN(pool.minLpDeposit.toString())),
    cachedOraclePrice: `$${(pool.lastOraclePrice.toNumber() / 1e9).toFixed(2)}`,
  }, null, 2);
}

export async function getSolPrice(): Promise<string> {
  const solPrice = await fetchSolPrice();
  const solUsd = pythPriceToUsd(solPrice);

  const program = getProgram();
  const [poolPda] = derivePoolPda();
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const k = new BN(pool.k.toString());
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const shortsolPrice = calcShortsolPrice(k, solPriceBn);

  return JSON.stringify({
    solPriceUsd: solUsd,
    shortsolPriceUsd: shortsolPrice.toNumber() / 1e9,
    confidence: solPrice.conf * 10 ** solPrice.expo,
    publishTime: new Date(solPrice.publishTime * 1000).toISOString(),
    cachedOraclePrice: pool.lastOraclePrice.toNumber() / 1e9,
  }, null, 2);
}

export async function getPosition(walletAddress?: string): Promise<string> {
  const conn = getConnection();
  const wallet = getWallet();
  const owner = walletAddress ? new PublicKey(walletAddress) : wallet.publicKey;
  const usdcMint = getUsdcMint();
  const [shortsolMint] = deriveShortsolMintPda();
  const [lpMint] = deriveLpMintPda();

  const result: any = { wallet: owner.toBase58() };

  try {
    const usdcAta = await getAssociatedTokenAddress(usdcMint, owner);
    const usdcAcc = await getAccount(conn, usdcAta);
    result.usdcBalance = formatUsdc(Number(usdcAcc.amount));
    result.usdcBalanceRaw = usdcAcc.amount.toString();
  } catch { result.usdcBalance = "$0.00"; result.usdcBalanceRaw = "0"; }

  try {
    const ssolAta = await getAssociatedTokenAddress(shortsolMint, owner);
    const ssolAcc = await getAccount(conn, ssolAta);
    result.shortsolBalance = (Number(ssolAcc.amount) / 1e9).toFixed(4) + " shortSOL";
    result.shortsolBalanceRaw = ssolAcc.amount.toString();
  } catch { result.shortsolBalance = "0 shortSOL"; result.shortsolBalanceRaw = "0"; }

  try {
    const program = getProgram();
    const [lpPositionPda] = deriveLpPositionPda(owner);
    const pos: any = await (program.account as any).lpPosition.fetch(lpPositionPda);
    result.lpShares = pos.lpShares.toString();
    result.lpPendingFees = formatUsdc(new BN(pos.pendingFees.toString()));
  } catch { result.lpShares = "0"; result.lpPendingFees = "$0.00"; }

  try {
    const lpAta = await getAssociatedTokenAddress(lpMint, owner);
    const lpAcc = await getAccount(conn, lpAta);
    result.lpTokenBalance = lpAcc.amount.toString();
  } catch { result.lpTokenBalance = "0"; }

  return JSON.stringify(result, null, 2);
}

// ─── Trading tools ───────────────────────────────────────────────────────────
// NOTE: mint/redeem require a fresh PriceUpdateV2 account on-chain.
// Without PythSolanaReceiver SDK (jito-ts dependency conflict),
// we use a two-step approach: the keeper/frontend posts price updates,
// and MCP server uses the cached price for read operations.
// For actual trading, agents should call updatePrice first via frontend.

export async function mint(usdcAmount: number): Promise<string> {
  return JSON.stringify({
    error: "Direct mint requires Pyth price posting (PythSolanaReceiver SDK has dependency conflict with jito-ts). Use the frontend at https://holging.netlify.app or run: npx ts-node scripts/test-mint.ts",
    workaround: "Call mint from the frontend with wallet connected, or use the CLI script.",
    usdcAmount,
  }, null, 2);
}

export async function redeem(shortsolAmount: number): Promise<string> {
  return JSON.stringify({
    error: "Direct redeem requires Pyth price posting (PythSolanaReceiver SDK has dependency conflict with jito-ts). Use the frontend at https://holging.netlify.app",
    workaround: "Call redeem from the frontend with wallet connected.",
    shortsolAmount,
  }, null, 2);
}

// ─── LP tools ────────────────────────────────────────────────────────────────

export async function addLiquidity(usdcAmount: number): Promise<string> {
  const wallet = getWallet();
  const program = getProgram();
  const usdcMint = getUsdcMint();

  const [poolPda] = derivePoolPda();
  const [vaultUsdc] = deriveVaultPda(usdcMint);
  const [lpMint] = deriveLpMintPda();
  const [lpPosition] = deriveLpPositionPda(wallet.publicKey);
  const lpProviderUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  const lpProviderLpAta = await getAssociatedTokenAddress(lpMint, wallet.publicKey);

  const usdcLamports = new BN(Math.round(usdcAmount * 1e6));

  const sig = await (program.methods as any)
    .addLiquidity(POOL_ID, usdcLamports)
    .accounts({
      poolState: poolPda, vaultUsdc, lpMint, lpPosition, lpProviderLpAta,
      usdcMint, lpProviderUsdc, lpProvider: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  await getConnection().confirmTransaction(sig, "confirmed");

  return JSON.stringify({
    success: true,
    action: "add_liquidity",
    usdcAmount: `$${usdcAmount}`,
    signature: sig,
    explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  }, null, 2);
}

export async function removeLiquidity(lpShares: number): Promise<string> {
  return JSON.stringify({
    error: "remove_liquidity requires Pyth price posting for vault health check. Use the frontend at https://holging.netlify.app",
    workaround: "Call removeLiquidity from the frontend with wallet connected.",
    lpShares,
  }, null, 2);
}

export async function claimLpFees(): Promise<string> {
  const wallet = getWallet();
  const program = getProgram();
  const usdcMint = getUsdcMint();

  const [poolPda] = derivePoolPda();
  const [vaultUsdc] = deriveVaultPda(usdcMint);
  const [lpPosition] = deriveLpPositionPda(wallet.publicKey);
  const lpProviderUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  const sig = await (program.methods as any)
    .claimLpFees(POOL_ID)
    .accounts({
      poolState: poolPda, vaultUsdc, lpPosition,
      usdcMint, lpProviderUsdc, lpProvider: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  await getConnection().confirmTransaction(sig, "confirmed");

  return JSON.stringify({
    success: true,
    action: "claim_lp_fees",
    signature: sig,
    explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  }, null, 2);
}
