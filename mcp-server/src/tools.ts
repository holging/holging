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
  calcShortsolPrice, formatUsdc, DEFAULT_POOL_ID, POOLS, PRICE_PRECISION,
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

// ─── Read-only tools ─────────────────────────────────────────────────────────

export async function getPoolState(poolId: string = DEFAULT_POOL_ID): Promise<string> {
  const program = getProgram();
  const [poolPda] = derivePoolPda(poolId);
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const solPrice = await fetchSolPrice(poolId);
  const solUsd = pythPriceToUsd(solPrice);
  const k = new BN(pool.k.toString());
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const shortsolPrice = calcShortsolPrice(k, solPriceBn);
  const shortsolUsd = shortsolPrice.toNumber() / 1e9;
  const poolName = POOLS[poolId]?.name ?? poolId;

  return JSON.stringify({
    poolId,
    poolName,
    pool: poolPda.toBase58(),
    vaultBalance: formatUsdc(new BN(pool.vaultBalance.toString())),
    vaultBalanceRaw: pool.vaultBalance.toString(),
    circulating: (new BN(pool.circulating.toString()).toNumber() / 1e9).toFixed(4) + ` ${poolName}`,
    k: pool.k.toString(),
    feeBps: pool.feeBps,
    paused: pool.paused,
    authority: pool.authority.toBase58(),
    assetPriceUsd: `$${solUsd.toFixed(2)}`,
    shortsolPriceUsd: `$${shortsolUsd.toFixed(2)}`,
    lpTotalSupply: pool.lpTotalSupply.toString(),
    lpPrincipal: formatUsdc(new BN(pool.lpPrincipal.toString())),
    totalLpFeesPending: formatUsdc(new BN(pool.totalLpFeesPending.toString())),
    totalFeesCollected: formatUsdc(new BN(pool.totalFeesCollected.toString())),
    minLpDeposit: formatUsdc(new BN(pool.minLpDeposit.toString())),
    cachedOraclePrice: `$${(pool.lastOraclePrice.toNumber() / 1e9).toFixed(2)}`,
  }, null, 2);
}

export async function getSolPrice(poolId: string = DEFAULT_POOL_ID): Promise<string> {
  const solPrice = await fetchSolPrice(poolId);
  const solUsd = pythPriceToUsd(solPrice);

  const program = getProgram();
  const [poolPda] = derivePoolPda(poolId);
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const k = new BN(pool.k.toString());
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const shortsolPrice = calcShortsolPrice(k, solPriceBn);

  return JSON.stringify({
    poolId,
    assetPriceUsd: solUsd,
    shortsolPriceUsd: shortsolPrice.toNumber() / 1e9,
    confidence: solPrice.conf * 10 ** solPrice.expo,
    publishTime: new Date(solPrice.publishTime * 1000).toISOString(),
    cachedOraclePrice: pool.lastOraclePrice.toNumber() / 1e9,
  }, null, 2);
}

export async function getPosition(walletAddress?: string, poolId: string = DEFAULT_POOL_ID): Promise<string> {
  const conn = getConnection();
  const wallet = getWallet();
  const owner = walletAddress ? new PublicKey(walletAddress) : wallet.publicKey;
  const usdcMint = getUsdcMint();
  const [shortsolMint] = deriveShortsolMintPda(poolId);
  const [lpMint] = deriveLpMintPda(poolId);
  const poolName = POOLS[poolId]?.name ?? poolId;

  const result: any = { wallet: owner.toBase58(), poolId };

  try {
    const usdcAta = await getAssociatedTokenAddress(usdcMint, owner);
    const usdcAcc = await getAccount(conn, usdcAta);
    result.usdcBalance = formatUsdc(Number(usdcAcc.amount));
    result.usdcBalanceRaw = usdcAcc.amount.toString();
  } catch { result.usdcBalance = "$0.00"; result.usdcBalanceRaw = "0"; }

  try {
    const ssolAta = await getAssociatedTokenAddress(shortsolMint, owner);
    const ssolAcc = await getAccount(conn, ssolAta);
    result.shortsolBalance = (Number(ssolAcc.amount) / 1e9).toFixed(4) + ` ${poolName}`;
    result.shortsolBalanceRaw = ssolAcc.amount.toString();
  } catch { result.shortsolBalance = `0 ${poolName}`; result.shortsolBalanceRaw = "0"; }

  try {
    const program = getProgram();
    const [lpPositionPda] = deriveLpPositionPda(owner, poolId);
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

export async function mint(usdcAmount: number, poolId: string = DEFAULT_POOL_ID): Promise<string> {
  return JSON.stringify({
    error: "Direct mint requires Pyth price posting (PythSolanaReceiver SDK has dependency conflict with jito-ts). Use the frontend at https://holging.com or run: npx ts-node scripts/test-mint.ts",
    workaround: "Call mint from the frontend with wallet connected, or use the CLI script.",
    poolId,
    usdcAmount,
  }, null, 2);
}

export async function redeem(shortsolAmount: number, poolId: string = DEFAULT_POOL_ID): Promise<string> {
  return JSON.stringify({
    error: "Direct redeem requires Pyth price posting (PythSolanaReceiver SDK has dependency conflict with jito-ts). Use the frontend at https://holging.com",
    workaround: "Call redeem from the frontend with wallet connected.",
    poolId,
    shortsolAmount,
  }, null, 2);
}

// ─── LP tools ────────────────────────────────────────────────────────────────

export async function addLiquidity(usdcAmount: number, poolId: string = DEFAULT_POOL_ID): Promise<string> {
  const wallet = getWallet();
  const program = getProgram();
  const usdcMint = getUsdcMint();

  const [poolPda] = derivePoolPda(poolId);
  const [vaultUsdc] = deriveVaultPda(usdcMint, poolId);
  const [lpMint] = deriveLpMintPda(poolId);
  const [lpPosition] = deriveLpPositionPda(wallet.publicKey, poolId);
  const lpProviderUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  const lpProviderLpAta = await getAssociatedTokenAddress(lpMint, wallet.publicKey);

  const usdcLamports = new BN(Math.round(usdcAmount * 1e6));

  const sig = await (program.methods as any)
    .addLiquidity(poolId, usdcLamports)
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
    poolId,
    usdcAmount: `$${usdcAmount}`,
    signature: sig,
    explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  }, null, 2);
}

export async function removeLiquidity(lpShares: number, poolId: string = DEFAULT_POOL_ID): Promise<string> {
  return JSON.stringify({
    error: "remove_liquidity requires Pyth price posting for vault health check. Use the frontend at https://holging.com",
    workaround: "Call removeLiquidity from the frontend with wallet connected.",
    poolId,
    lpShares,
  }, null, 2);
}

export async function claimLpFees(poolId: string = DEFAULT_POOL_ID): Promise<string> {
  const wallet = getWallet();
  const program = getProgram();
  const usdcMint = getUsdcMint();

  const [poolPda] = derivePoolPda(poolId);
  const [vaultUsdc] = deriveVaultPda(usdcMint, poolId);
  const [lpPosition] = deriveLpPositionPda(wallet.publicKey, poolId);
  const lpProviderUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  const sig = await (program.methods as any)
    .claimLpFees(poolId)
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
    poolId,
    signature: sig,
    explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  }, null, 2);
}
