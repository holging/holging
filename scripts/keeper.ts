/**
 * Funding Keeper — периодически вызывает accrue_funding для decay k.
 *
 * Запуск:
 *   npx ts-node scripts/keeper.ts
 *
 * Env переменные (опционально):
 *   ANCHOR_WALLET  — путь к keypair (по умолчанию ~/solana-wallet.json)
 *   KEEPER_INTERVAL_SECS — интервал между вызовами в секундах (по умолчанию 3600 = 1 час)
 *   RPC_URL — RPC endpoint (по умолчанию devnet)
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, VersionedTransaction } from "@solana/web3.js";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import * as fs from "fs";
import * as path from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const DEVNET_RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const POOL_ID = "sol";
const INTERVAL_SECS = parseInt(process.env.KEEPER_INTERVAL_SECS || "3600", 10);
const HERMES_URL = "https://hermes.pyth.network";
const SOL_USD_FEED_ID = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

// PDA seeds
const POOL_SEED = Buffer.from("pool");
const FUNDING_SEED = Buffer.from("funding");

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchPriceUpdateData(): Promise<string[]> {
  const resp = await fetch(
    `${HERMES_URL}/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}&encoding=base64`
  );
  if (!resp.ok) throw new Error(`Hermes API error: ${resp.status}`);
  const data = await resp.json();
  return data.binary.data;
}

async function sendVersionedTxs(
  txs: any[],
  wallet: anchor.Wallet,
  connection: Connection
): Promise<string> {
  let lastSig = "";
  for (const entry of txs) {
    const vtx: VersionedTransaction = entry.tx || entry;
    const ephemeralSigners: Keypair[] = entry.signers || [];

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    vtx.message.recentBlockhash = blockhash;

    if (ephemeralSigners.length > 0) {
      vtx.sign(ephemeralSigners);
    }

    const signed = await wallet.signTransaction(vtx);
    const sig = await connection.sendTransaction(signed);
    await connection.confirmTransaction(sig, "confirmed");
    lastSig = sig;
  }
  return lastSig;
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function accrueFunding(
  program: anchor.Program,
  connection: Connection,
  wallet: anchor.Wallet,
  poolPda: PublicKey,
  fundingConfigPda: PublicKey
): Promise<void> {
  // Читаем текущее состояние funding config
  let fundingAcc: any;
  try {
    fundingAcc = await (program.account as any).fundingConfig.fetch(fundingConfigPda);
  } catch {
    console.log("[keeper] FundingConfig не найден — initialize_funding не вызывался. Пропускаю.");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - fundingAcc.lastFundingAt.toNumber();
  const rateBps = fundingAcc.rateBps;

  console.log(`[keeper] elapsed=${elapsed}s  rate=${rateBps}bps/day`);

  if (elapsed < 60) {
    console.log("[keeper] Слишком мало времени прошло (<60s), пропускаю.");
    return;
  }

  // Читаем k до вызова
  const poolAcc: any = await (program.account as any).poolState.fetch(poolPda);
  const kBefore = poolAcc.k.toString();

  // Получаем VAA с Hermes и постим price update на цепочку
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
        priceUpdateAccount = getPriceUpdateAccount("0x" + SOL_USD_FEED_ID);
      } catch {
        priceUpdateAccount = getPriceUpdateAccount(SOL_USD_FEED_ID);
      }

      const accrueIx = await (program.methods as any)
        .accrueFunding(POOL_ID)
        .accounts({
          poolState: poolPda,
          fundingConfig: fundingConfigPda,
          priceUpdate: priceUpdateAccount,
        })
        .instruction();

      return [{ instruction: accrueIx, signers: [] }];
    }
  );

  const txs = await txBuilder.buildVersionedTransactions({
    tightComputeBudget: false,
  });

  const sig = await sendVersionedTxs(txs, wallet, connection);

  // Читаем k после
  const poolAccAfter: any = await (program.account as any).poolState.fetch(poolPda);
  const kAfter = poolAccAfter.k.toString();

  console.log(`[keeper] ✓ accrue_funding  sig=${sig}`);
  console.log(`[keeper]   k: ${kBefore} → ${kAfter}`);
  console.log(`[keeper]   explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

async function main() {
  // Загружаем кошелёк
  const walletPath =
    process.env.ANCHOR_WALLET || `${process.env.HOME}/solana-wallet.json`;
  if (!fs.existsSync(walletPath)) {
    console.error(`Кошелёк не найден: ${walletPath}`);
    process.exit(1);
  }
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.resolve(__dirname, "../target/idl/solshort.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl, provider);

  const programId = new PublicKey(idl.address);
  const poolIdBuf = Buffer.from(POOL_ID);
  const [poolPda] = PublicKey.findProgramAddressSync([POOL_SEED, poolIdBuf], programId);
  const [fundingConfigPda] = PublicKey.findProgramAddressSync(
    [FUNDING_SEED, poolPda.toBuffer()],
    programId
  );

  console.log(`[keeper] Запуск. Интервал: ${INTERVAL_SECS}s`);
  console.log(`[keeper] Keeper wallet: ${keypair.publicKey.toBase58()}`);
  console.log(`[keeper] Pool PDA:      ${poolPda.toBase58()}`);
  console.log(`[keeper] FundingConfig: ${fundingConfigPda.toBase58()}`);
  console.log(`[keeper] RPC: ${DEVNET_RPC}`);

  // Первый вызов сразу при старте
  await runOnce(program, connection, wallet, poolPda, fundingConfigPda);

  // Затем по интервалу
  setInterval(
    () => runOnce(program, connection, wallet, poolPda, fundingConfigPda),
    INTERVAL_SECS * 1000
  );
}

async function runOnce(
  program: anchor.Program,
  connection: Connection,
  wallet: anchor.Wallet,
  poolPda: PublicKey,
  fundingConfigPda: PublicKey
) {
  try {
    await accrueFunding(program, connection, wallet, poolPda, fundingConfigPda);
  } catch (err: any) {
    console.error(`[keeper] Ошибка:`, err?.message ?? err);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
