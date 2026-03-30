import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills({ include: ["buffer", "process"] })],
  define: {
    "process.env": {},
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Solana core — heaviest dep, rarely changes
          solana: [
            "@solana/web3.js",
            "@solana/spl-token",
            "@solana/wallet-adapter-base",
            "@solana/wallet-adapter-react",
            "@solana/wallet-adapter-react-ui",
            "@solana/wallet-adapter-wallets",
          ],
          // Anchor + Pyth
          anchor: [
            "@coral-xyz/anchor",
            "@pythnetwork/hermes-client",
            "@pythnetwork/pyth-solana-receiver",
          ],
        },
      },
    },
  },
});
