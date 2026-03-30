import {
  BaseWalletAdapter,
  WalletName,
  WalletReadyState,
  WalletNotConnectedError,
} from "@solana/wallet-adapter-base";
import type { SendTransactionOptions } from "@solana/wallet-adapter-base";
import type { SupportedTransactionVersions } from "@solana/wallet-adapter-base";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SendOptions,
} from "@solana/web3.js";

const STORAGE_KEY = "holging-burner-wallet";
const ICON =
  "data:image/svg+xml;base64," +
  btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1a1a2e"/>
  <circle cx="32" cy="28" r="12" fill="#ff6b00"/>
  <circle cx="28" cy="24" r="4" fill="#ffcc00"/>
  <circle cx="36" cy="20" r="3" fill="#ffaa00"/>
  <circle cx="32" cy="16" r="2" fill="#ff8800"/>
  <text x="32" y="54" font-size="12" text-anchor="middle" fill="#aaa" font-family="monospace">DEV</text>
</svg>`);

export const BurnerWalletName = "Burner Wallet" as WalletName<"Burner Wallet">;

/**
 * BurnerWalletAdapter — an ephemeral devnet wallet stored in localStorage.
 *
 * - On first connect, generates a fresh Keypair and stores the secret in localStorage.
 * - On subsequent connects, restores the same Keypair.
 * - Signs Transaction and VersionedTransaction natively (no browser extension needed).
 * - Designed for devnet testing / hackathon demos ONLY.
 */
export class BurnerWalletAdapter extends BaseWalletAdapter<"Burner Wallet"> {
  name = BurnerWalletName;
  url = "https://github.com/nicholasgasior/solana-burner-wallet";
  icon = ICON;
  supportedTransactionVersions: SupportedTransactionVersions = new Set([
    "legacy",
    0,
  ]);

  private _keypair: Keypair | null = null;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _readyState: WalletReadyState = WalletReadyState.Loadable;

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get connecting(): boolean {
    return this._connecting;
  }

  get connected(): boolean {
    return !!this._publicKey;
  }

  get readyState(): WalletReadyState {
    return this._readyState;
  }

  async connect(): Promise<void> {
    if (this._publicKey) return; // already connected
    this._connecting = true;
    try {
      let secretKey: Uint8Array;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        secretKey = new Uint8Array(JSON.parse(stored));
      } else {
        const kp = Keypair.generate();
        secretKey = kp.secretKey;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(secretKey)));
      }
      this._keypair = Keypair.fromSecretKey(secretKey);
      this._publicKey = this._keypair.publicKey;

      this.emit("connect", this._publicKey);
    } catch (error: any) {
      this.emit("error", error);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._keypair = null;
    this._publicKey = null;
    this.emit("disconnect");
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: SendTransactionOptions
  ): Promise<string> {
    if (!this._keypair) throw new WalletNotConnectedError();

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    let signed: Transaction | VersionedTransaction;

    if (transaction instanceof VersionedTransaction) {
      transaction.message.recentBlockhash = blockhash;
      transaction.sign([this._keypair]);
      if (options?.signers?.length) {
        transaction.sign(options.signers);
      }
      signed = transaction;
    } else {
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this._keypair.publicKey;
      if (options?.signers?.length) {
        transaction.partialSign(...options.signers);
      }
      transaction.partialSign(this._keypair);
      signed = transaction;
    }

    const rawTransaction = signed.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: options?.skipPreflight,
      preflightCommitment: options?.preflightCommitment,
      maxRetries: options?.maxRetries,
      minContextSlot: options?.minContextSlot,
    });

    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    return signature;
  }

  /**
   * Sign a single transaction — used by useAnchorWallet().signTransaction
   */
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._keypair) throw new WalletNotConnectedError();

    if (tx instanceof VersionedTransaction) {
      tx.sign([this._keypair]);
    } else {
      (tx as Transaction).partialSign(this._keypair);
    }
    return tx;
  }

  /**
   * Sign multiple transactions — used by useAnchorWallet().signAllTransactions
   */
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    if (!this._keypair) throw new WalletNotConnectedError();
    return txs.map((tx) => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([this._keypair!]);
      } else {
        (tx as Transaction).partialSign(this._keypair!);
      }
      return tx;
    });
  }

  /** Wipe stored key and generate a fresh one on next connect */
  static resetBurnerWallet(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Get the stored address without connecting (for display purposes) */
  static getStoredAddress(): string | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(stored)));
      return kp.publicKey.toBase58();
    } catch {
      return null;
    }
  }
}
