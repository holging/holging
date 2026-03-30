/**
 * Pyth price poster — delegates to scripts/post-pyth-price.cjs
 * which runs in app's node_modules context (has pyth-solana-receiver).
 *
 * Returns the PriceUpdateV2 account pubkey on-chain.
 */
import { PublicKey } from "@solana/web3.js";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, "../../scripts/post-pyth-price.cjs");
const APP_DIR = path.resolve(__dirname, "../../app");

export async function postPriceAndGetAccount(poolId: string): Promise<PublicKey> {
  try {
    const result = execSync(
      `node "${SCRIPT_PATH}" ${poolId}`,
      {
        timeout: 45000,
        cwd: APP_DIR,
        env: {
          ...process.env,
          NODE_PATH: path.join(APP_DIR, "node_modules"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const output = result.toString().trim();
    const lastLine = output.split("\n").pop()!.trim();

    // Validate it's a valid pubkey
    const pubkey = new PublicKey(lastLine);
    return pubkey;
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    throw new Error(
      `Failed to post Pyth price: ${stderr || stdout || err.message}`,
    );
  }
}
