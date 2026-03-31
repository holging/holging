/**
 * Holging Transaction Builder API
 *
 * Builds unsigned Solana transactions for agents.
 * Agent sends wallet address → gets back serialized tx → signs locally → submits to RPC.
 *
 * Server NEVER sees private keys.
 */
import { createServer } from "http";
import {
  Connection, PublicKey, Transaction, SystemProgram,
  VersionedTransaction, TransactionMessage,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { postPriceAndGetAccount } from "./pyth-poster.js";
import {
  POOLS, PROGRAM_ID, PRICE_PRECISION, BPS_DENOMINATOR, DEFAULT_POOL_ID,
  derivePoolPda, deriveShortsolMintPda, deriveMintAuthPda,
  deriveVaultPda, deriveFundingConfigPda, deriveLpMintPda, deriveLpPositionPda,
  fetchSolPrice, pythPriceToUsd, pythPriceToPrecision,
  calcShortsolPrice, calcDynamicFee, calcAdaptiveRate, calcMintTokens, calcRedeemUsdc,
  getPoolName, getAssetName, getFeedId,
} from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3002", 10);
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(process.env.USDC_MINT || "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn");
const FAUCET_PROGRAM_ID = new PublicKey("BqisdDoAVUH8KH2uAspUfCYSiiAwdLvuEepk1R8A7hGn");
const SLIPPAGE_BPS = 200; // 2%

const conn = new Connection(RPC_URL, "confirmed");

// Load IDL
const idlPath = [
  path.resolve(__dirname, "../idl/holging.json"),
  path.resolve(__dirname, "../../target/idl/holging.json"),
].find(p => fs.existsSync(p));
const IDL = idlPath ? JSON.parse(fs.readFileSync(idlPath, "utf-8")) : null;

const faucetIdlPath = [
  path.resolve(__dirname, "../idl/faucet.json"),
  path.resolve(__dirname, "../../target/idl/faucet.json"),
].find(p => fs.existsSync(p));
const FAUCET_IDL = faucetIdlPath ? JSON.parse(fs.readFileSync(faucetIdlPath, "utf-8")) : null;

// Dummy wallet for building instructions (never signs)
const DUMMY_KP = anchor.web3.Keypair.generate();
const DUMMY_WALLET = new anchor.Wallet(DUMMY_KP);
const provider = new anchor.AnchorProvider(conn, DUMMY_WALLET, { commitment: "confirmed" });
const program = IDL ? new anchor.Program(IDL, provider) : null;
const faucetProgram = FAUCET_IDL ? new anchor.Program(FAUCET_IDL, provider) : null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(res: any, status: number, data: any) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: string) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
}

async function serializeTx(tx: Transaction, feePayer: PublicKey): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = feePayer;
  // Serialize without signatures — agent will sign
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return serialized.toString("base64");
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

async function handleGetPrices(res: any) {
  const results: any = {};
  for (const [id, pool] of Object.entries(POOLS)) {
    try {
      const pyth = await fetchSolPrice(id);
      const usd = pythPriceToUsd(pyth);
      const priceBn = new BN(pythPriceToPrecision(pyth).toString());
      const [poolPda] = derivePoolPda(id);
      const poolState: any = await (program!.account as any).poolState.fetch(poolPda);
      const k = new BN(poolState.k.toString());
      const shortPrice = calcShortsolPrice(k, priceBn);

      results[id] = {
        asset: (pool as any).asset,
        token: (pool as any).name,
        assetPrice: Number(usd.toFixed(2)),
        tokenPrice: Number((shortPrice.toNumber() / 1e9).toFixed(4)),
        circulating: poolState.circulating.toString(),
        vaultBalance: `$${(poolState.vaultBalance.toNumber() / 1e6).toFixed(2)}`,
      };
    } catch (e: any) {
      results[id] = { error: e.message };
    }
  }
  jsonResponse(res, 200, { prices: results });
}

async function handleGetPosition(res: any, wallet: string, poolId: string) {
  const pk = new PublicKey(wallet);
  const [poolPda] = derivePoolPda(poolId);
  const [shortMint] = deriveShortsolMintPda(poolId);

  const solBal = await conn.getBalance(pk);
  let usdcBal = 0, tokenBal = 0;

  try {
    const usdcAta = await getAssociatedTokenAddress(USDC_MINT, pk);
    const info = await conn.getTokenAccountBalance(usdcAta);
    usdcBal = Number(info.value.uiAmount || 0);
  } catch {}

  try {
    const tokenAta = await getAssociatedTokenAddress(shortMint, pk);
    const info = await conn.getTokenAccountBalance(tokenAta);
    tokenBal = Number(info.value.uiAmount || 0);
  } catch {}

  jsonResponse(res, 200, {
    wallet,
    poolId,
    sol: Number((solBal / 1e9).toFixed(4)),
    usdc: Number(usdcBal.toFixed(2)),
    [getPoolName(poolId)]: Number(tokenBal.toFixed(6)),
  });
}

async function handleSimulateMint(res: any, usdcAmount: number, poolId: string) {
  const [poolPda] = derivePoolPda(poolId);
  const poolState: any = await (program!.account as any).poolState.fetch(poolPda);
  const pyth = await fetchSolPrice(poolId);
  const priceBn = new BN(pythPriceToPrecision(pyth).toString());
  const k = new BN(poolState.k.toString());
  const shortPrice = calcShortsolPrice(k, priceBn);
  const fee = calcDynamicFee(
    new BN(poolState.feeBps), new BN(poolState.vaultBalance.toString()),
    new BN(poolState.circulating.toString()), k, priceBn,
  );
  const usdcLamports = new BN(Math.round(usdcAmount * 1e6));
  const { tokens, fee: feeAmount } = calcMintTokens(usdcLamports, shortPrice, fee);

  jsonResponse(res, 200, {
    action: "mint",
    poolId,
    usdcIn: usdcAmount,
    expectedTokens: Number((tokens.toNumber() / 1e9).toFixed(6)),
    fee: `$${(feeAmount.toNumber() / 1e6).toFixed(4)}`,
    feeBps: fee.toNumber(),
    assetPrice: Number(pythPriceToUsd(pyth).toFixed(2)),
    tokenPrice: Number((shortPrice.toNumber() / 1e9).toFixed(4)),
  });
}

async function handleBuildMint(res: any, wallet: string, usdcAmount: number, poolId: string) {
  const userPk = new PublicKey(wallet);
  const [poolPda] = derivePoolPda(poolId);
  const [shortMint] = deriveShortsolMintPda(poolId);
  const [mintAuth] = deriveMintAuthPda(poolId);
  const [vaultUsdc] = deriveVaultPda(USDC_MINT, poolId);
  const [fundingPda] = deriveFundingConfigPda(poolId);
  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, userPk);
  const userShortsol = await getAssociatedTokenAddress(shortMint, userPk);
  const usdcLamports = new BN(Math.round(usdcAmount * 1e6));

  // Post Pyth price (server pays for this)
  const priceAccount = await postPriceAndGetAccount(poolId);

  // Calculate slippage
  const poolState: any = await (program!.account as any).poolState.fetch(poolPda);
  const pyth = await fetchSolPrice(poolId);
  const priceBn = new BN(pythPriceToPrecision(pyth).toString());
  const k = new BN(poolState.k.toString());
  const shortPrice = calcShortsolPrice(k, priceBn);
  const dynFee = calcDynamicFee(
    new BN(poolState.feeBps), new BN(poolState.vaultBalance.toString()),
    new BN(poolState.circulating.toString()), k, priceBn,
  );
  const { tokens } = calcMintTokens(usdcLamports, shortPrice, dynFee);
  const minOut = tokens.mul(BPS_DENOMINATOR.sub(new BN(SLIPPAGE_BPS))).div(BPS_DENOMINATOR);

  const tx = new Transaction();

  // Create shortSOL ATA if needed
  const ataInfo = await conn.getAccountInfo(userShortsol);
  if (!ataInfo) {
    tx.add(createAssociatedTokenAccountInstruction(userPk, userShortsol, userPk, shortMint));
  }

  // update_price
  const updateIx = await (program!.methods as any)
    .updatePrice(poolId)
    .accounts({ poolState: poolPda, pythPrice: priceAccount, payer: userPk })
    .instruction();
  tx.add(updateIx);

  // mint
  const mintIx = await (program!.methods as any)
    .mint(poolId, usdcLamports, minOut)
    .accountsStrict({
      poolState: poolPda, vaultUsdc, shortsolMint: shortMint, mintAuthority: mintAuth,
      priceUpdate: priceAccount, usdcMint: USDC_MINT, userUsdc, userShortsol,
      user: userPk, fundingConfig: fundingPda,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .instruction();
  tx.add(mintIx);

  const serialized = await serializeTx(tx, userPk);

  jsonResponse(res, 200, {
    tx: serialized,
    action: "mint",
    poolId,
    usdcIn: usdcAmount,
    expectedTokens: Number((tokens.toNumber() / 1e9).toFixed(6)),
    fee: `$${(usdcLamports.mul(dynFee).div(BPS_DENOMINATOR).toNumber() / 1e6).toFixed(4)}`,
    message: `Sign and send this transaction to mint ~${(tokens.toNumber() / 1e9).toFixed(4)} ${getPoolName(poolId)}`,
    howToSign: "Base64-decode the 'tx' field, sign with your wallet, send via sendRawTransaction",
  });
}

async function handleBuildRedeem(res: any, wallet: string, tokenAmount: number, poolId: string) {
  const userPk = new PublicKey(wallet);
  const [poolPda] = derivePoolPda(poolId);
  const [shortMint] = deriveShortsolMintPda(poolId);
  const [vaultUsdc] = deriveVaultPda(USDC_MINT, poolId);
  const [fundingPda] = deriveFundingConfigPda(poolId);
  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, userPk);
  const userShortsol = await getAssociatedTokenAddress(shortMint, userPk);
  const tokenLamports = new BN(Math.round(tokenAmount * 1e9));

  const priceAccount = await postPriceAndGetAccount(poolId);

  const poolState: any = await (program!.account as any).poolState.fetch(poolPda);
  const pyth = await fetchSolPrice(poolId);
  const priceBn = new BN(pythPriceToPrecision(pyth).toString());
  const k = new BN(poolState.k.toString());
  const shortPrice = calcShortsolPrice(k, priceBn);
  const dynFee = calcDynamicFee(
    new BN(poolState.feeBps), new BN(poolState.vaultBalance.toString()),
    new BN(poolState.circulating.toString()), k, priceBn,
  );
  const { usdcOut, fee } = calcRedeemUsdc(tokenLamports, shortPrice, dynFee);
  const minOut = usdcOut.mul(BPS_DENOMINATOR.sub(new BN(SLIPPAGE_BPS))).div(BPS_DENOMINATOR);

  const tx = new Transaction();

  const updateIx = await (program!.methods as any)
    .updatePrice(poolId)
    .accounts({ poolState: poolPda, pythPrice: priceAccount, payer: userPk })
    .instruction();
  tx.add(updateIx);

  const redeemIx = await (program!.methods as any)
    .redeem(poolId, tokenLamports, minOut)
    .accountsStrict({
      poolState: poolPda, vaultUsdc, shortsolMint: shortMint,
      priceUpdate: priceAccount, usdcMint: USDC_MINT,
      userShortsol, userUsdc, user: userPk, fundingConfig: fundingPda,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .instruction();
  tx.add(redeemIx);

  const serialized = await serializeTx(tx, userPk);

  jsonResponse(res, 200, {
    tx: serialized,
    action: "redeem",
    poolId,
    tokensIn: tokenAmount,
    expectedUsdc: Number((usdcOut.toNumber() / 1e6).toFixed(4)),
    fee: `$${(fee.toNumber() / 1e6).toFixed(4)}`,
    message: `Sign and send this transaction to redeem ${tokenAmount} ${getPoolName(poolId)} for ~$${(usdcOut.toNumber() / 1e6).toFixed(2)} USDC`,
    howToSign: "Base64-decode the 'tx' field, sign with your wallet, send via sendRawTransaction",
  });
}

async function handleBuildClaimUsdc(res: any, wallet: string) {
  if (!faucetProgram) {
    jsonResponse(res, 500, { error: "Faucet IDL not found" });
    return;
  }

  const userPk = new PublicKey(wallet);
  const [faucetState] = PublicKey.findProgramAddressSync([Buffer.from("faucet")], FAUCET_PROGRAM_ID);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault")], FAUCET_PROGRAM_ID);
  const [claimRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), userPk.toBuffer()], FAUCET_PROGRAM_ID
  );
  const userAta = await getAssociatedTokenAddress(USDC_MINT, userPk);

  const tx = new Transaction();

  const ataInfo = await conn.getAccountInfo(userAta);
  if (!ataInfo) {
    tx.add(createAssociatedTokenAccountInstruction(userPk, userAta, userPk, USDC_MINT));
  }

  const claimIx = await (faucetProgram.methods as any)
    .claim()
    .accounts({
      user: userPk, faucetState, vault, claimRecord, userAta,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .instruction();
  tx.add(claimIx);

  const serialized = await serializeTx(tx, userPk);

  jsonResponse(res, 200, {
    tx: serialized,
    action: "claim_usdc",
    amount: "5,000 USDC",
    message: "Sign and send this transaction to claim 5,000 devnet USDC (1x per 24h)",
    howToSign: "Base64-decode the 'tx' field, sign with your wallet, send via sendRawTransaction",
  });
}

// ─── Pool detail ─────────────────────────────────────────────────────────────

async function handleGetPool(res: any, poolId: string) {
  if (!POOLS[poolId]) { jsonResponse(res, 404, { error: `Unknown pool: ${poolId}. Valid: ${Object.keys(POOLS).join(", ")}` }); return; }

  const [poolPda] = derivePoolPda(poolId);
  const poolState: any = await (program!.account as any).poolState.fetch(poolPda);
  const pyth = await fetchSolPrice(poolId);
  const priceBn = new BN(pythPriceToPrecision(pyth).toString());
  const k = new BN(poolState.k.toString());
  const shortPrice = calcShortsolPrice(k, priceBn);
  const circulating = new BN(poolState.circulating.toString());
  const vaultBalance = new BN(poolState.vaultBalance.toString());
  const dynFee = calcDynamicFee(new BN(poolState.feeBps), vaultBalance, circulating, k, priceBn);

  const obligations = circulating.mul(shortPrice).div(PRICE_PRECISION).div(new BN(1000));
  const coverage = obligations.isZero() ? "∞" : `${(vaultBalance.toNumber() / obligations.toNumber() * 100).toFixed(1)}%`;

  // Fetch FundingConfig for adaptive rate — gracefully degrade if not found
  let adaptiveFields: { effectiveRateBps: number; baseRateBps: number; fundingTier: string } | undefined;
  try {
    const [fundingPda] = deriveFundingConfigPda(poolId);
    const fundingConfig: any = await (program!.account as any).fundingConfig.fetch(fundingPda);
    const baseRate = fundingConfig.rateBps as number;
    const { effectiveRateBps, tierLabel } = calcAdaptiveRate(baseRate, vaultBalance, circulating, k, priceBn);
    adaptiveFields = { effectiveRateBps, baseRateBps: baseRate, fundingTier: tierLabel };
  } catch {
    // FundingConfig not initialized for this pool — omit adaptive fields
  }

  jsonResponse(res, 200, {
    poolId,
    asset: getAssetName(poolId),
    token: getPoolName(poolId),
    assetPrice: Number(pythPriceToUsd(pyth).toFixed(2)),
    tokenPrice: Number((shortPrice.toNumber() / 1e9).toFixed(4)),
    k: poolState.k.toString(),
    feeBps: poolState.feeBps,
    dynamicFeeBps: dynFee.toNumber(),
    circulating: circulating.toString(),
    vaultBalance: Number((vaultBalance.toNumber() / 1e6).toFixed(2)),
    obligations: Number((obligations.toNumber() / 1e6).toFixed(2)),
    coverage,
    totalMinted: poolState.totalMinted.toString(),
    totalRedeemed: poolState.totalRedeemed.toString(),
    totalFeesCollected: Number((poolState.totalFeesCollected.toNumber() / 1e6).toFixed(2)),
    paused: poolState.paused,
    lpTotalSupply: poolState.lpTotalSupply.toString(),
    lpPrincipal: Number((poolState.lpPrincipal.toNumber() / 1e6).toFixed(2)),
    minLpDeposit: Number((poolState.minLpDeposit.toNumber() / 1e6).toFixed(2)),
    authority: poolState.authority.toBase58(),
    ...(adaptiveFields ?? {}),
  });
}

// ─── LP Transaction Builders ─────────────────────────────────────────────────

const SPL_ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

async function handleBuildAddLiquidity(res: any, wallet: string, usdcAmount: number, poolId: string) {
  const userPk = new PublicKey(wallet);
  const [poolPda] = derivePoolPda(poolId);
  const [vaultUsdc] = deriveVaultPda(USDC_MINT, poolId);
  const [lpMint] = deriveLpMintPda(poolId);
  const [lpPosition] = deriveLpPositionPda(userPk, poolId);
  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, userPk);
  const userLpAta = await getAssociatedTokenAddress(lpMint, userPk);
  const usdcLamports = new BN(Math.round(usdcAmount * 1e6));

  const tx = new Transaction();

  const addLiqIx = await (program!.methods as any)
    .addLiquidity(poolId, usdcLamports)
    .accounts({
      poolState: poolPda, vaultUsdc, lpMint, lpPosition,
      lpProviderLpAta: userLpAta, usdcMint: USDC_MINT,
      lpProviderUsdc: userUsdc, lpProvider: userPk,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: SPL_ATA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  tx.add(addLiqIx);

  const serialized = await serializeTx(tx, userPk);

  jsonResponse(res, 200, {
    tx: serialized,
    action: "add_liquidity",
    poolId,
    usdcAmount,
    message: `Sign and send to deposit $${usdcAmount} USDC as LP in ${getPoolName(poolId)} pool`,
    howToSign: "Base64-decode 'tx', sign with your wallet, send via sendRawTransaction",
  });
}

async function handleBuildRemoveLiquidity(res: any, wallet: string, lpShares: number, poolId: string) {
  const userPk = new PublicKey(wallet);
  const [poolPda] = derivePoolPda(poolId);
  const [vaultUsdc] = deriveVaultPda(USDC_MINT, poolId);
  const [lpMint] = deriveLpMintPda(poolId);
  const [lpPosition] = deriveLpPositionPda(userPk, poolId);
  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, userPk);
  const userLpAta = await getAssociatedTokenAddress(lpMint, userPk);
  const sharesBn = new BN(Math.round(lpShares));

  const priceAccount = await postPriceAndGetAccount(poolId);

  const tx = new Transaction();

  const updateIx = await (program!.methods as any)
    .updatePrice(poolId)
    .accounts({ poolState: poolPda, pythPrice: priceAccount, payer: userPk })
    .instruction();
  tx.add(updateIx);

  const removeLiqIx = await (program!.methods as any)
    .removeLiquidity(poolId, sharesBn)
    .accounts({
      poolState: poolPda, vaultUsdc, lpMint, lpPosition,
      lpProviderLpAta: userLpAta, usdcMint: USDC_MINT,
      lpProviderUsdc: userUsdc, priceUpdate: priceAccount,
      lpProvider: userPk, tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  tx.add(removeLiqIx);

  const serialized = await serializeTx(tx, userPk);

  jsonResponse(res, 200, {
    tx: serialized,
    action: "remove_liquidity",
    poolId,
    lpShares,
    message: `Sign and send to withdraw LP shares from ${getPoolName(poolId)} pool`,
    howToSign: "Base64-decode 'tx', sign with your wallet, send via sendRawTransaction",
  });
}

async function handleBuildClaimLpFees(res: any, wallet: string, poolId: string) {
  const userPk = new PublicKey(wallet);
  const [poolPda] = derivePoolPda(poolId);
  const [vaultUsdc] = deriveVaultPda(USDC_MINT, poolId);
  const [lpPosition] = deriveLpPositionPda(userPk, poolId);
  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, userPk);

  const tx = new Transaction();

  const claimIx = await (program!.methods as any)
    .claimLpFees(poolId)
    .accounts({
      poolState: poolPda, vaultUsdc, lpPosition,
      usdcMint: USDC_MINT, lpProviderUsdc: userUsdc,
      lpProvider: userPk, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  tx.add(claimIx);

  const serialized = await serializeTx(tx, userPk);

  jsonResponse(res, 200, {
    tx: serialized,
    action: "claim_lp_fees",
    poolId,
    message: `Sign and send to claim accumulated LP fees from ${getPoolName(poolId)} pool`,
    howToSign: "Base64-decode 'tx', sign with your wallet, send via sendRawTransaction",
  });
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    // ─── GET endpoints ──────────────────────────────────────────────
    if (req.method === "GET") {
      if (url.pathname === "/" || url.pathname === "/health") {
        jsonResponse(res, 200, {
          status: "ok",
          server: "holging-tx-builder",
          version: "1.1.0",
          network: "devnet",
          endpoints: {
            "GET  /prices": "All pool prices",
            "GET  /pool/:id": "Detailed pool state (sol, tsla, spy, aapl)",
            "GET  /position?wallet=...&pool=sol": "Wallet balances",
            "GET  /simulate/mint?amount=100&pool=sol": "Preview mint",
            "GET  /simulate/redeem?amount=1.5&pool=sol": "Preview redeem",
            "POST /build/mint": "Build unsigned mint tx { wallet, amount, pool? }",
            "POST /build/redeem": "Build unsigned redeem tx { wallet, amount, pool? }",
            "POST /build/claim_usdc": "Build unsigned faucet claim tx { wallet }",
            "POST /build/add_liquidity": "Build unsigned LP deposit tx { wallet, amount, pool? }",
            "POST /build/remove_liquidity": "Build unsigned LP withdraw tx { wallet, lp_shares, pool? }",
            "POST /build/claim_lp_fees": "Build unsigned LP fee claim tx { wallet, pool? }",
          },
        });
        return;
      }

      if (url.pathname === "/prices") {
        await handleGetPrices(res);
        return;
      }

      // /pool/:id
      const poolMatch = url.pathname.match(/^\/pool\/(\w+)$/);
      if (poolMatch) {
        await handleGetPool(res, poolMatch[1]);
        return;
      }

      if (url.pathname === "/position") {
        const wallet = url.searchParams.get("wallet");
        const pool = url.searchParams.get("pool") || "sol";
        if (!wallet) { jsonResponse(res, 400, { error: "Missing ?wallet=..." }); return; }
        await handleGetPosition(res, wallet, pool);
        return;
      }

      if (url.pathname === "/simulate/mint") {
        const amount = parseFloat(url.searchParams.get("amount") || "0");
        const pool = url.searchParams.get("pool") || "sol";
        if (!amount) { jsonResponse(res, 400, { error: "Missing ?amount=100" }); return; }
        await handleSimulateMint(res, amount, pool);
        return;
      }

      if (url.pathname === "/simulate/redeem") {
        const amount = parseFloat(url.searchParams.get("amount") || "0");
        const pool = url.searchParams.get("pool") || "sol";
        if (!amount) { jsonResponse(res, 400, { error: "Missing ?amount=1.5" }); return; }
        // simulate_redeem
        const [poolPda] = derivePoolPda(pool);
        const poolState: any = await (program!.account as any).poolState.fetch(poolPda);
        const pyth = await fetchSolPrice(pool);
        const priceBn = new BN(pythPriceToPrecision(pyth).toString());
        const k = new BN(poolState.k.toString());
        const shortPrice = calcShortsolPrice(k, priceBn);
        const fee = calcDynamicFee(
          new BN(poolState.feeBps), new BN(poolState.vaultBalance.toString()),
          new BN(poolState.circulating.toString()), k, priceBn,
        );
        const tokenLamports = new BN(Math.round(amount * 1e9));
        const { usdcOut, fee: feeAmt } = calcRedeemUsdc(tokenLamports, shortPrice, fee);
        jsonResponse(res, 200, {
          action: "redeem", poolId: pool, tokensIn: amount,
          expectedUsdc: Number((usdcOut.toNumber() / 1e6).toFixed(4)),
          fee: `$${(feeAmt.toNumber() / 1e6).toFixed(4)}`,
          assetPrice: Number(pythPriceToUsd(pyth).toFixed(2)),
          tokenPrice: Number((shortPrice.toNumber() / 1e9).toFixed(4)),
        });
        return;
      }
    }

    // ─── POST endpoints ─────────────────────────────────────────────
    if (req.method === "POST") {
      const body = await readBody(req);

      if (url.pathname === "/build/mint") {
        const { wallet, amount, pool } = body;
        if (!wallet || !amount) { jsonResponse(res, 400, { error: "Need { wallet, amount, pool? }" }); return; }
        await handleBuildMint(res, wallet, amount, pool || "sol");
        return;
      }

      if (url.pathname === "/build/redeem") {
        const { wallet, amount, pool } = body;
        if (!wallet || !amount) { jsonResponse(res, 400, { error: "Need { wallet, amount, pool? }" }); return; }
        await handleBuildRedeem(res, wallet, amount, pool || "sol");
        return;
      }

      if (url.pathname === "/build/claim_usdc") {
        const { wallet } = body;
        if (!wallet) { jsonResponse(res, 400, { error: "Need { wallet }" }); return; }
        await handleBuildClaimUsdc(res, wallet);
        return;
      }

      if (url.pathname === "/build/add_liquidity") {
        const { wallet, amount, pool } = body;
        if (!wallet || !amount) { jsonResponse(res, 400, { error: "Need { wallet, amount, pool? }" }); return; }
        await handleBuildAddLiquidity(res, wallet, amount, pool || "sol");
        return;
      }

      if (url.pathname === "/build/remove_liquidity") {
        const { wallet, lp_shares, pool } = body;
        if (!wallet || !lp_shares) { jsonResponse(res, 400, { error: "Need { wallet, lp_shares, pool? }" }); return; }
        await handleBuildRemoveLiquidity(res, wallet, lp_shares, pool || "sol");
        return;
      }

      if (url.pathname === "/build/claim_lp_fees") {
        const { wallet, pool } = body;
        if (!wallet) { jsonResponse(res, 400, { error: "Need { wallet, pool? }" }); return; }
        await handleBuildClaimLpFees(res, wallet, pool || "sol");
        return;
      }
    }

    jsonResponse(res, 404, { error: "Not found. GET / for available endpoints." });
  } catch (e: any) {
    console.error("Error:", e.message);
    jsonResponse(res, 500, { error: e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🔨 Holging Transaction Builder API v1.1.0 on http://0.0.0.0:${PORT}`);
  console.log(`   Network: devnet | Pools: ${Object.keys(POOLS).length}`);
  console.log(`   GET  /prices, /pool/:id, /position, /simulate/mint, /simulate/redeem`);
  console.log(`   POST /build/mint, /build/redeem, /build/claim_usdc`);
  console.log(`   POST /build/add_liquidity, /build/remove_liquidity, /build/claim_lp_fees`);
});
