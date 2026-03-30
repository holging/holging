import {
  PublicKey, Transaction, TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import BN from "bn.js";

import { getConnection, getWallet, getProgram, getUsdcMint } from "./solana.js";
import { postPriceAndGetAccount } from "./pyth-poster.js";
import {
  derivePoolPda, deriveShortsolMintPda, deriveMintAuthPda,
  deriveVaultPda, deriveFundingConfigPda, deriveLpMintPda, deriveLpPositionPda,
  fetchSolPrice, pythPriceToUsd, pythPriceToPrecision,
  calcShortsolPrice, calcDynamicFee, calcMintTokens, calcRedeemUsdc,
  formatUsdc, getPoolName, getAssetName, getFeedId,
  DEFAULT_POOL_ID, POOLS, PRICE_PRECISION, BPS_DENOMINATOR,
} from "./utils.js";

const SLIPPAGE_BPS = 200; // 2% slippage for agent safety

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
  const poolName = getPoolName(poolId);
  const assetName = getAssetName(poolId);
  const circulating = new BN(pool.circulating.toString());
  const vaultBalance = new BN(pool.vaultBalance.toString());

  // Coverage ratio
  const obligations = circulating.mul(shortsolPrice).div(PRICE_PRECISION);
  const obligationsUsdc = obligations.div(new BN(1000));
  const coverageRatio = obligationsUsdc.isZero()
    ? "∞"
    : (vaultBalance.toNumber() / obligationsUsdc.toNumber() * 100).toFixed(1) + "%";

  // Dynamic fee
  const dynamicFee = calcDynamicFee(
    new BN(pool.feeBps), vaultBalance, circulating, k, solPriceBn,
  );

  return JSON.stringify({
    poolId,
    poolName,
    assetName,
    pool: poolPda.toBase58(),
    assetPriceUsd: `$${solUsd.toFixed(2)}`,
    inverseTokenPriceUsd: `$${shortsolUsd.toFixed(2)}`,
    vaultBalance: formatUsdc(vaultBalance),
    obligations: formatUsdc(obligationsUsdc),
    coverageRatio,
    circulating: (circulating.toNumber() / 1e9).toFixed(4) + ` ${poolName}`,
    k: pool.k.toString(),
    baseFee: `${pool.feeBps / 100}%`,
    dynamicFee: `${dynamicFee.toNumber() / 100}%`,
    paused: pool.paused,
    authority: pool.authority.toBase58(),
    lpTotalSupply: pool.lpTotalSupply.toString(),
    lpPrincipal: formatUsdc(new BN(pool.lpPrincipal.toString())),
    totalLpFeesPending: formatUsdc(new BN(pool.totalLpFeesPending.toString())),
    totalFeesCollected: formatUsdc(new BN(pool.totalFeesCollected.toString())),
    minLpDeposit: formatUsdc(new BN(pool.minLpDeposit.toString())),
    totalMinted: (new BN(pool.totalMinted.toString()).toNumber() / 1e9).toFixed(4),
    totalRedeemed: (new BN(pool.totalRedeemed.toString()).toNumber() / 1e9).toFixed(4),
  }, null, 2);
}

export async function getSolPrice(poolId: string = DEFAULT_POOL_ID): Promise<string> {
  const solPrice = await fetchSolPrice(poolId);
  const solUsd = pythPriceToUsd(solPrice);
  const assetName = getAssetName(poolId);
  const poolName = getPoolName(poolId);

  const program = getProgram();
  const [poolPda] = derivePoolPda(poolId);
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const k = new BN(pool.k.toString());
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const shortsolPrice = calcShortsolPrice(k, solPriceBn);

  return JSON.stringify({
    poolId,
    assetName,
    poolName,
    [`${assetName}_USD`]: solUsd,
    [`${poolName}_USD`]: shortsolPrice.toNumber() / 1e9,
    confidence: solPrice.conf * 10 ** solPrice.expo,
    publishTime: new Date(solPrice.publishTime * 1000).toISOString(),
    k: pool.k.toString(),
  }, null, 2);
}

export async function getPosition(
  walletAddress?: string,
  poolId: string = DEFAULT_POOL_ID,
): Promise<string> {
  const conn = getConnection();
  const wallet = getWallet();
  const owner = walletAddress ? new PublicKey(walletAddress) : wallet.publicKey;
  const usdcMint = getUsdcMint();
  const [shortsolMint] = deriveShortsolMintPda(poolId);
  const [lpMint] = deriveLpMintPda(poolId);
  const poolName = getPoolName(poolId);

  const result: any = { wallet: owner.toBase58(), poolId };

  // SOL balance
  try {
    const lamports = await conn.getBalance(owner);
    result.solBalance = (lamports / 1e9).toFixed(4) + " SOL";
  } catch { result.solBalance = "0 SOL"; }

  // USDC
  try {
    const usdcAta = await getAssociatedTokenAddress(usdcMint, owner);
    const usdcAcc = await getAccount(conn, usdcAta);
    result.usdcBalance = formatUsdc(Number(usdcAcc.amount));
    result.usdcBalanceRaw = usdcAcc.amount.toString();
  } catch { result.usdcBalance = "$0.00"; result.usdcBalanceRaw = "0"; }

  // Inverse token
  try {
    const ssolAta = await getAssociatedTokenAddress(shortsolMint, owner);
    const ssolAcc = await getAccount(conn, ssolAta);
    const balance = Number(ssolAcc.amount) / 1e9;
    result.inverseTokenBalance = balance.toFixed(4) + ` ${poolName}`;
    result.inverseTokenBalanceRaw = ssolAcc.amount.toString();

    // Calculate value
    const solPrice = await fetchSolPrice(poolId);
    const program = getProgram();
    const [poolPda] = derivePoolPda(poolId);
    const pool: any = await (program.account as any).poolState.fetch(poolPda);
    const k = new BN(pool.k.toString());
    const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
    const shortsolPrice = calcShortsolPrice(k, solPriceBn);
    result.inverseTokenValueUsd = `$${(balance * shortsolPrice.toNumber() / 1e9).toFixed(2)}`;
  } catch {
    result.inverseTokenBalance = `0 ${poolName}`;
    result.inverseTokenBalanceRaw = "0";
    result.inverseTokenValueUsd = "$0.00";
  }

  // LP position
  try {
    const program = getProgram();
    const [lpPositionPda] = deriveLpPositionPda(owner, poolId);
    const pos: any = await (program.account as any).lpPosition.fetch(lpPositionPda);
    result.lpShares = pos.lpShares.toString();
    result.lpPrincipal = formatUsdc(new BN(pos.principal.toString()));
    result.lpPendingFees = formatUsdc(new BN(pos.pendingFees.toString()));
  } catch { result.lpShares = "0"; result.lpPendingFees = "$0.00"; }

  // LP token ATA
  try {
    const lpAta = await getAssociatedTokenAddress(lpMint, owner);
    const lpAcc = await getAccount(conn, lpAta);
    result.lpTokenBalance = lpAcc.amount.toString();
  } catch { result.lpTokenBalance = "0"; }

  return JSON.stringify(result, null, 2);
}

export async function getAllPrices(): Promise<string> {
  const results: any[] = [];
  for (const [poolId, info] of Object.entries(POOLS)) {
    try {
      const price = await fetchSolPrice(poolId);
      const usd = pythPriceToUsd(price);
      const program = getProgram();
      const [poolPda] = derivePoolPda(poolId);
      const pool: any = await (program.account as any).poolState.fetch(poolPda);
      const k = new BN(pool.k.toString());
      const priceBn = new BN(pythPriceToPrecision(price).toString());
      const inversePrice = calcShortsolPrice(k, priceBn);
      results.push({
        poolId,
        asset: info.asset,
        inverseName: info.name,
        assetPriceUsd: usd,
        inversePriceUsd: inversePrice.toNumber() / 1e9,
        circulating: (new BN(pool.circulating.toString()).toNumber() / 1e9).toFixed(4),
        vaultUsd: formatUsdc(new BN(pool.vaultBalance.toString())),
        paused: pool.paused,
      });
    } catch (e: any) {
      results.push({ poolId, asset: info.asset, error: e.message });
    }
  }
  return JSON.stringify(results, null, 2);
}

// ─── Trading tools ───────────────────────────────────────────────────────────

export async function mint(
  usdcAmount: number,
  poolId: string = DEFAULT_POOL_ID,
): Promise<string> {
  const conn = getConnection();
  const wallet = getWallet();
  const program = getProgram();
  const usdcMint = getUsdcMint();
  const poolName = getPoolName(poolId);

  const [poolPda] = derivePoolPda(poolId);
  const [shortsolMint] = deriveShortsolMintPda(poolId);
  const [mintAuth] = deriveMintAuthPda(poolId);
  const [vaultUsdc] = deriveVaultPda(usdcMint, poolId);
  const [fundingPda] = deriveFundingConfigPda(poolId);
  const userUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  const userShortsol = await getAssociatedTokenAddress(shortsolMint, wallet.publicKey);

  const usdcLamports = new BN(Math.round(usdcAmount * 1e6));

  // Step 1: Post Pyth price update
  const priceUpdateAccount = await postPriceAndGetAccount(poolId);

  // Step 2: Create ATA if needed + updatePrice + mint
  const preIxs: TransactionInstruction[] = [];
  const ataInfo = await conn.getAccountInfo(userShortsol);
  if (!ataInfo) {
    preIxs.push(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey, userShortsol, wallet.publicKey, shortsolMint,
      )
    );
  }

  // Calculate expected output with slippage
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const solPrice = await fetchSolPrice(poolId);
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const shortsolPrice = calcShortsolPrice(new BN(pool.k.toString()), solPriceBn);
  const dynamicFee = calcDynamicFee(
    new BN(pool.feeBps), new BN(pool.vaultBalance.toString()),
    new BN(pool.circulating.toString()), new BN(pool.k.toString()), solPriceBn,
  );
  const { tokens: expectedTokens } = calcMintTokens(usdcLamports, shortsolPrice, dynamicFee);
  const minTokensOut = expectedTokens
    .mul(BPS_DENOMINATOR.sub(new BN(SLIPPAGE_BPS)))
    .div(BPS_DENOMINATOR);

  const updatePriceIx = await (program.methods as any)
    .updatePrice(poolId)
    .accounts({
      poolState: poolPda,
      pythPrice: priceUpdateAccount,
      payer: wallet.publicKey,
    })
    .instruction();

  const mintIx = await (program.methods as any)
    .mint(poolId, usdcLamports, minTokensOut)
    .accountsStrict({
      poolState: poolPda,
      vaultUsdc,
      shortsolMint,
      mintAuthority: mintAuth,
      priceUpdate: priceUpdateAccount,
      usdcMint,
      userUsdc,
      userShortsol,
      user: wallet.publicKey,
      fundingConfig: fundingPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction();
  preIxs.forEach((ix) => tx.add(ix));
  tx.add(updatePriceIx);
  tx.add(mintIx);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet.payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  const expectedTokensNum = expectedTokens.toNumber() / 1e9;

  return JSON.stringify({
    success: true,
    action: "mint",
    poolId,
    poolName,
    usdcDeposited: `$${usdcAmount}`,
    expectedTokens: expectedTokensNum.toFixed(4) + ` ${poolName}`,
    fee: `${dynamicFee.toNumber() / 100}%`,
    signature: sig,
    explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  }, null, 2);
}

export async function redeem(
  tokenAmount: number,
  poolId: string = DEFAULT_POOL_ID,
): Promise<string> {
  const conn = getConnection();
  const wallet = getWallet();
  const program = getProgram();
  const usdcMint = getUsdcMint();
  const poolName = getPoolName(poolId);

  const [poolPda] = derivePoolPda(poolId);
  const [shortsolMint] = deriveShortsolMintPda(poolId);
  const [vaultUsdc] = deriveVaultPda(usdcMint, poolId);
  const [fundingPda] = deriveFundingConfigPda(poolId);
  const userUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  const userShortsol = await getAssociatedTokenAddress(shortsolMint, wallet.publicKey);

  const tokenLamports = new BN(Math.round(tokenAmount * 1e9));

  // Step 1: Post Pyth price update via subprocess
  const priceUpdateAccount = await postPriceAndGetAccount(poolId);

  // Step 2: Build regular TX with updatePrice + redeem
  const updatePriceIx = await (program.methods as any)
    .updatePrice(poolId)
    .accounts({
      poolState: poolPda,
      pythPrice: priceUpdateAccount,
      payer: wallet.publicKey,
    })
    .instruction();

  // Calculate slippage-protected minimum
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const solPrice = await fetchSolPrice(poolId);
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const shortsolPrice = calcShortsolPrice(new BN(pool.k.toString()), solPriceBn);
  const dynamicFee = calcDynamicFee(
    new BN(pool.feeBps), new BN(pool.vaultBalance.toString()),
    new BN(pool.circulating.toString()), new BN(pool.k.toString()), solPriceBn,
  );
  const { usdcOut: expectedUsdc } = calcRedeemUsdc(tokenLamports, shortsolPrice, dynamicFee);
  const minUsdcOut = expectedUsdc
    .mul(BPS_DENOMINATOR.sub(new BN(SLIPPAGE_BPS)))
    .div(BPS_DENOMINATOR);

  const redeemIx = await (program.methods as any)
    .redeem(poolId, tokenLamports, minUsdcOut)
    .accountsStrict({
      poolState: poolPda,
      vaultUsdc,
      shortsolMint,
      priceUpdate: priceUpdateAccount,
      usdcMint,
      userShortsol,
      userUsdc,
      user: wallet.publicKey,
      fundingConfig: fundingPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction();
  tx.add(updatePriceIx);
  tx.add(redeemIx);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet.payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  return JSON.stringify({
    success: true,
    action: "redeem",
    poolId,
    poolName,
    tokensRedeemed: tokenAmount.toFixed(4) + ` ${poolName}`,
    expectedUsdc: formatUsdc(expectedUsdc),
    fee: `${dynamicFee.toNumber() / 100}%`,
    signature: sig,
    explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  }, null, 2);
}

// ─── Simulation tools ────────────────────────────────────────────────────────

export async function simulateMint(
  usdcAmount: number,
  poolId: string = DEFAULT_POOL_ID,
): Promise<string> {
  const program = getProgram();
  const [poolPda] = derivePoolPda(poolId);
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const solPrice = await fetchSolPrice(poolId);
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const k = new BN(pool.k.toString());
  const shortsolPrice = calcShortsolPrice(k, solPriceBn);
  const dynamicFee = calcDynamicFee(
    new BN(pool.feeBps), new BN(pool.vaultBalance.toString()),
    new BN(pool.circulating.toString()), k, solPriceBn,
  );
  const usdcLamports = new BN(Math.round(usdcAmount * 1e6));
  const { tokens, fee } = calcMintTokens(usdcLamports, shortsolPrice, dynamicFee);
  const poolName = getPoolName(poolId);
  const assetName = getAssetName(poolId);

  return JSON.stringify({
    action: "simulate_mint",
    poolId,
    input: `$${usdcAmount} USDC`,
    expectedOutput: (tokens.toNumber() / 1e9).toFixed(4) + ` ${poolName}`,
    fee: formatUsdc(fee),
    feePercent: `${dynamicFee.toNumber() / 100}%`,
    [`${assetName}_price`]: `$${pythPriceToUsd(solPrice).toFixed(2)}`,
    [`${poolName}_price`]: `$${(shortsolPrice.toNumber() / 1e9).toFixed(2)}`,
    note: "Simulation only — no transaction sent. Use 'mint' tool to execute.",
  }, null, 2);
}

export async function simulateRedeem(
  tokenAmount: number,
  poolId: string = DEFAULT_POOL_ID,
): Promise<string> {
  const program = getProgram();
  const [poolPda] = derivePoolPda(poolId);
  const pool: any = await (program.account as any).poolState.fetch(poolPda);
  const solPrice = await fetchSolPrice(poolId);
  const solPriceBn = new BN(pythPriceToPrecision(solPrice).toString());
  const k = new BN(pool.k.toString());
  const shortsolPrice = calcShortsolPrice(k, solPriceBn);
  const dynamicFee = calcDynamicFee(
    new BN(pool.feeBps), new BN(pool.vaultBalance.toString()),
    new BN(pool.circulating.toString()), k, solPriceBn,
  );
  const tokenLamports = new BN(Math.round(tokenAmount * 1e9));
  const { usdcOut, fee } = calcRedeemUsdc(tokenLamports, shortsolPrice, dynamicFee);
  const poolName = getPoolName(poolId);

  return JSON.stringify({
    action: "simulate_redeem",
    poolId,
    input: tokenAmount.toFixed(4) + ` ${poolName}`,
    expectedOutput: formatUsdc(usdcOut) + " USDC",
    fee: formatUsdc(fee),
    feePercent: `${dynamicFee.toNumber() / 100}%`,
    note: "Simulation only — no transaction sent. Use 'redeem' tool to execute.",
  }, null, 2);
}

// ─── LP tools ────────────────────────────────────────────────────────────────

export async function addLiquidity(
  usdcAmount: number,
  poolId: string = DEFAULT_POOL_ID,
): Promise<string> {
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
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  await getConnection().confirmTransaction(sig, "confirmed");

  return JSON.stringify({
    success: true,
    action: "add_liquidity",
    poolId,
    usdcDeposited: `$${usdcAmount}`,
    signature: sig,
    explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  }, null, 2);
}

export async function removeLiquidity(
  lpShares: number,
  poolId: string = DEFAULT_POOL_ID,
): Promise<string> {
  const conn = getConnection();
  const wallet = getWallet();
  const program = getProgram();
  const usdcMint = getUsdcMint();

  const [poolPda] = derivePoolPda(poolId);
  const [vaultUsdc] = deriveVaultPda(usdcMint, poolId);
  const [lpMint] = deriveLpMintPda(poolId);
  const [lpPosition] = deriveLpPositionPda(wallet.publicKey, poolId);
  const lpProviderUsdc = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  const lpProviderLpAta = await getAssociatedTokenAddress(lpMint, wallet.publicKey);

  const lpSharesBn = new BN(Math.round(lpShares));

  // Step 1: Post Pyth price (needed for vault health check)
  const priceUpdateAccount = await postPriceAndGetAccount(poolId);

  // Step 2: removeLiquidity in regular TX
  const ix = await (program.methods as any)
    .removeLiquidity(poolId, lpSharesBn)
    .accounts({
      poolState: poolPda, vaultUsdc, lpMint, lpPosition, lpProviderLpAta,
      usdcMint, lpProviderUsdc, priceUpdate: priceUpdateAccount,
      lpProvider: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet.payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  return JSON.stringify({
    success: true,
    action: "remove_liquidity",
    poolId,
    lpSharesBurned: lpShares,
    signature: sig,
    explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  }, null, 2);
}

export async function claimLpFees(
  poolId: string = DEFAULT_POOL_ID,
): Promise<string> {
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

// ═══════════════════════════════════════════════════════════════════════════════
//  FAUCET — Claim devnet USDC
// ═══════════════════════════════════════════════════════════════════════════════

const FAUCET_PROGRAM_ID = new PublicKey("BqisdDoAVUH8KH2uAspUfCYSiiAwdLvuEepk1R8A7hGn");

export async function claimUsdc(): Promise<string> {
  const conn = getConnection();
  const wallet = getWallet();
  const usdcMint = getUsdcMint();

  const [faucetState] = PublicKey.findProgramAddressSync(
    [Buffer.from("faucet")],
    FAUCET_PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    FAUCET_PROGRAM_ID,
  );
  const [claimRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), wallet.publicKey.toBuffer()],
    FAUCET_PROGRAM_ID,
  );

  const userAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  // Build transaction
  const tx = new Transaction();

  // Create ATA if needed
  const ataInfo = await conn.getAccountInfo(userAta);
  if (!ataInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey, userAta, wallet.publicKey, usdcMint,
      ),
    );
  }

  // Load faucet IDL and build claim instruction
  const fs = await import("fs");
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const faucetIdl = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../idl/faucet.json"), "utf-8"),
  );

  const anchor = await import("@coral-xyz/anchor");
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const faucetProgram = new anchor.Program(faucetIdl, provider);

  const claimIx = await (faucetProgram.methods as any)
    .claim()
    .accounts({
      user: wallet.publicKey,
      faucetState,
      vault,
      claimRecord,
      userAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  tx.add(claimIx);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  const signed = await wallet.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  // Check new balance
  try {
    const ata = await getAccount(conn, userAta);
    const balance = Number(ata.amount) / 1e6;
    return JSON.stringify({
      success: true,
      claimed: "5,000 USDC",
      newBalance: `${balance.toFixed(2)} USDC`,
      tx: sig,
      explorer: `https://solscan.io/tx/${sig}?cluster=devnet`,
      note: "Rate limited: 1 claim per 24 hours",
    }, null, 2);
  } catch {
    return JSON.stringify({
      success: true,
      claimed: "5,000 USDC",
      tx: sig,
      explorer: `https://solscan.io/tx/${sig}?cluster=devnet`,
    }, null, 2);
  }
}
