/**
 * Solafon Mini App Bridge
 *
 * Placeholder SDK integration for Solafon's embedded wallet mini app platform.
 * When the Solafon SDK becomes available, replace these stubs with real calls.
 */

export interface SolafonUser {
  walletAddress: string;
  displayName?: string;
}

export interface SolafonBridge {
  /** Check if running inside Solafon container */
  isInSolafon(): boolean;

  /** Get the embedded wallet's public key */
  getWalletAddress(): Promise<string>;

  /** Request transaction signing via Solafon's embedded wallet */
  signTransaction(serializedTx: Uint8Array): Promise<Uint8Array>;

  /** Request multiple transaction signing */
  signAllTransactions(txs: Uint8Array[]): Promise<Uint8Array[]>;

  /** Show a native notification inside Solafon */
  notify(message: string, type?: "success" | "error" | "info"): void;

  /** Navigate back in Solafon's mini app stack */
  goBack(): void;

  /** Share a referral/link via Solafon's social features */
  share(url: string, text?: string): void;

  /** Get user profile info from Solafon */
  getUserProfile(): Promise<SolafonUser | null>;
}

/**
 * Stub implementation for development outside Solafon.
 * All methods are no-ops or return sensible defaults.
 */
class SolafonBridgeStub implements SolafonBridge {
  isInSolafon(): boolean {
    return false;
  }

  async getWalletAddress(): Promise<string> {
    throw new Error("Not running inside Solafon. Use standard wallet adapter.");
  }

  async signTransaction(serializedTx: Uint8Array): Promise<Uint8Array> {
    throw new Error("Not running inside Solafon. Use standard wallet adapter.");
  }

  async signAllTransactions(txs: Uint8Array[]): Promise<Uint8Array[]> {
    throw new Error("Not running inside Solafon. Use standard wallet adapter.");
  }

  notify(message: string, type?: "success" | "error" | "info"): void {
    console.log(`[Solafon stub] ${type ?? "info"}: ${message}`);
  }

  goBack(): void {
    window.history.back();
  }

  share(url: string, text?: string): void {
    if (navigator.share) {
      navigator.share({ url, text });
    } else {
      navigator.clipboard.writeText(url);
    }
  }

  async getUserProfile(): Promise<SolafonUser | null> {
    return null;
  }
}

/**
 * Initialize the bridge. When running inside Solafon, this will
 * connect to the native bridge via postMessage / injected global.
 * Outside Solafon, returns a stub.
 */
export function createSolafonBridge(): SolafonBridge {
  // Check for injected Solafon SDK
  if (typeof window !== "undefined" && (window as any).__SOLAFON_BRIDGE__) {
    return (window as any).__SOLAFON_BRIDGE__ as SolafonBridge;
  }
  return new SolafonBridgeStub();
}

export const solafon = createSolafonBridge();
