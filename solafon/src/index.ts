/**
 * SolShort — Solafon Mini App Entry Point
 *
 * This module integrates SolShort with the Solafon mini app platform.
 * It wraps the standard React app with Solafon-specific wallet handling.
 *
 * Usage:
 *   1. Build the main React app (cd app && npm run build)
 *   2. Embed the built assets in Solafon's mini app container
 *   3. The bridge auto-detects Solafon and routes wallet calls accordingly
 *
 * When Solafon SDK is available:
 *   - Replace SolafonBridgeStub with real SDK calls
 *   - Implement SolafonWalletAdapter extending BaseMessageSignerWalletAdapter
 *   - Register it in WalletProvider alongside Phantom
 */

export { solafon, createSolafonBridge } from "./bridge";
export type { SolafonBridge, SolafonUser } from "./bridge";
