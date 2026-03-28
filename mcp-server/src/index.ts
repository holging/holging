import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getPoolState, getSolPrice, getPosition,
  mint, redeem,
  addLiquidity, removeLiquidity, claimLpFees,
} from "./tools.js";

const server = new McpServer({
  name: "holging",
  version: "1.0.0",
});

// ─── Read-only tools ─────────────────────────────────────────────────────────

server.tool(
  "get_pool_state",
  "Get Holging protocol pool state: vault balance, circulating shortSOL, prices, LP stats, fee info",
  {},
  async () => ({ content: [{ type: "text", text: await getPoolState() }] })
);

server.tool(
  "get_sol_price",
  "Get current SOL/USD price from Pyth oracle and calculated shortSOL price",
  {},
  async () => ({ content: [{ type: "text", text: await getSolPrice() }] })
);

server.tool(
  "get_position",
  "Get wallet balances: USDC, shortSOL, LP shares, pending fees",
  { wallet_address: z.string().optional().describe("Solana wallet address (default: server wallet)") },
  async ({ wallet_address }) => ({
    content: [{ type: "text", text: await getPosition(wallet_address) }],
  })
);

// ─── Trading tools ───────────────────────────────────────────────────────────

server.tool(
  "mint",
  "Mint shortSOL tokens by depositing USDC. Returns shortSOL to the server wallet.",
  { usdc_amount: z.number().positive().describe("USDC amount to deposit (e.g. 100 = $100)") },
  async ({ usdc_amount }) => ({
    content: [{ type: "text", text: await mint(usdc_amount) }],
  })
);

server.tool(
  "redeem",
  "Redeem shortSOL tokens back to USDC. Burns shortSOL and returns USDC.",
  { shortsol_amount: z.number().positive().describe("shortSOL amount to redeem (e.g. 1.5)") },
  async ({ shortsol_amount }) => ({
    content: [{ type: "text", text: await redeem(shortsol_amount) }],
  })
);

// ─── LP tools ────────────────────────────────────────────────────────────────

server.tool(
  "add_liquidity",
  "Deposit USDC as liquidity provider. Receive LP tokens. Min deposit: $100 USDC.",
  { usdc_amount: z.number().min(100).describe("USDC amount to deposit (min 100)") },
  async ({ usdc_amount }) => ({
    content: [{ type: "text", text: await addLiquidity(usdc_amount) }],
  })
);

server.tool(
  "remove_liquidity",
  "Withdraw liquidity by burning LP tokens. Returns proportional USDC.",
  { lp_shares: z.number().positive().describe("LP shares to burn") },
  async ({ lp_shares }) => ({
    content: [{ type: "text", text: await removeLiquidity(lp_shares) }],
  })
);

server.tool(
  "claim_lp_fees",
  "Claim accumulated trading fees as LP provider. Transfers pending USDC fees to wallet.",
  {},
  async () => ({
    content: [{ type: "text", text: await claimLpFees() }],
  })
);

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
