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

const poolIdParam = z.string().optional().describe("Pool ID: sol, tsla, spy, aapl (default: sol)");

// ─── Read-only tools ─────────────────────────────────────────────────────────

server.tool(
  "get_pool_state",
  "Get Holging protocol pool state: vault balance, circulating tokens, prices, LP stats, fee info",
  { pool_id: poolIdParam },
  async ({ pool_id }) => ({ content: [{ type: "text", text: await getPoolState(pool_id) }] })
);

server.tool(
  "get_sol_price",
  "Get current asset price from Pyth oracle and calculated inverse token price",
  { pool_id: poolIdParam },
  async ({ pool_id }) => ({ content: [{ type: "text", text: await getSolPrice(pool_id) }] })
);

server.tool(
  "get_position",
  "Get wallet balances: USDC, inverse tokens, LP shares, pending fees",
  {
    wallet_address: z.string().optional().describe("Solana wallet address (default: server wallet)"),
    pool_id: poolIdParam,
  },
  async ({ wallet_address, pool_id }) => ({
    content: [{ type: "text", text: await getPosition(wallet_address, pool_id) }],
  })
);

// ─── Trading tools ───────────────────────────────────────────────────────────

server.tool(
  "mint",
  "Mint inverse tokens by depositing USDC. Returns tokens to the server wallet.",
  {
    usdc_amount: z.number().positive().describe("USDC amount to deposit (e.g. 100 = $100)"),
    pool_id: poolIdParam,
  },
  async ({ usdc_amount, pool_id }) => ({
    content: [{ type: "text", text: await mint(usdc_amount, pool_id) }],
  })
);

server.tool(
  "redeem",
  "Redeem inverse tokens back to USDC. Burns tokens and returns USDC.",
  {
    shortsol_amount: z.number().positive().describe("Token amount to redeem (e.g. 1.5)"),
    pool_id: poolIdParam,
  },
  async ({ shortsol_amount, pool_id }) => ({
    content: [{ type: "text", text: await redeem(shortsol_amount, pool_id) }],
  })
);

// ─── LP tools ────────────────────────────────────────────────────────────────

server.tool(
  "add_liquidity",
  "Deposit USDC as liquidity provider. Receive LP tokens. Min deposit: $100 USDC.",
  {
    usdc_amount: z.number().min(100).describe("USDC amount to deposit (min 100)"),
    pool_id: poolIdParam,
  },
  async ({ usdc_amount, pool_id }) => ({
    content: [{ type: "text", text: await addLiquidity(usdc_amount, pool_id) }],
  })
);

server.tool(
  "remove_liquidity",
  "Withdraw liquidity by burning LP tokens. Returns proportional USDC.",
  {
    lp_shares: z.number().positive().describe("LP shares to burn"),
    pool_id: poolIdParam,
  },
  async ({ lp_shares, pool_id }) => ({
    content: [{ type: "text", text: await removeLiquidity(lp_shares, pool_id) }],
  })
);

server.tool(
  "claim_lp_fees",
  "Claim accumulated trading fees as LP provider. Transfers pending USDC fees to wallet.",
  { pool_id: poolIdParam },
  async ({ pool_id }) => ({
    content: [{ type: "text", text: await claimLpFees(pool_id) }],
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
