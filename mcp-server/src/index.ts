import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getPoolState, getSolPrice, getPosition, getAllPrices,
  mint, redeem, simulateMint, simulateRedeem,
  addLiquidity, removeLiquidity, claimLpFees,
  claimUsdc,
} from "./tools.js";
import { POOLS } from "./utils.js";

const server = new McpServer({
  name: "holging",
  version: "2.0.0",
});

const poolIds = Object.keys(POOLS);
const poolIdParam = z.enum(poolIds as [string, ...string[]])
  .optional()
  .describe(`Pool ID: ${poolIds.join(", ")} (default: sol)`);

// ═══════════════════════════════════════════════════════════════════════════════
//  READ-ONLY TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "get_pool_state",
  `Get complete Holging protocol pool state including:
  - Vault balance, obligations, coverage ratio
  - Circulating supply and token prices
  - Dynamic fee rate and LP stats
  - Total minted/redeemed metrics`,
  { pool_id: poolIdParam },
  async ({ pool_id }) => ({
    content: [{ type: "text", text: await getPoolState(pool_id) }],
  })
);

server.tool(
  "get_price",
  `Get current asset price from Pyth oracle and calculated inverse token price.
  Shows real-time price, confidence interval, and k constant.`,
  { pool_id: poolIdParam },
  async ({ pool_id }) => ({
    content: [{ type: "text", text: await getSolPrice(pool_id) }],
  })
);

server.tool(
  "get_all_prices",
  `Get prices and status for ALL pools in one call.
  Returns asset prices, inverse token prices, circulating supply, vault balances.
  Use this for portfolio overview or market scanning.`,
  {},
  async () => ({
    content: [{ type: "text", text: await getAllPrices() }],
  })
);

server.tool(
  "get_position",
  `Get complete wallet position: SOL balance, USDC balance, inverse token
  holdings with USD value, and LP position (shares, principal, pending fees).`,
  {
    wallet_address: z.string().optional().describe("Solana wallet address (default: server wallet)"),
    pool_id: poolIdParam,
  },
  async ({ wallet_address, pool_id }) => ({
    content: [{ type: "text", text: await getPosition(wallet_address, pool_id) }],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
//  SIMULATION TOOLS (read-only, no transaction)
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "simulate_mint",
  `Simulate minting inverse tokens WITHOUT executing a transaction.
  Shows expected token output, fee amount, and current prices.
  Use this before calling 'mint' to preview the trade.`,
  {
    usdc_amount: z.number().positive().describe("USDC amount to simulate (e.g. 100 = $100)"),
    pool_id: poolIdParam,
  },
  async ({ usdc_amount, pool_id }) => ({
    content: [{ type: "text", text: await simulateMint(usdc_amount, pool_id) }],
  })
);

server.tool(
  "simulate_redeem",
  `Simulate redeeming inverse tokens back to USDC WITHOUT executing a transaction.
  Shows expected USDC output and fee amount.
  Use this before calling 'redeem' to preview the trade.`,
  {
    token_amount: z.number().positive().describe("Inverse token amount to simulate (e.g. 1.5)"),
    pool_id: poolIdParam,
  },
  async ({ token_amount, pool_id }) => ({
    content: [{ type: "text", text: await simulateRedeem(token_amount, pool_id) }],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
//  TRADING TOOLS (execute on-chain transactions)
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "mint",
  `Mint inverse tokens by depositing USDC. Executes on-chain:
  1. Posts fresh Pyth price oracle update
  2. Updates cached price on pool
  3. Mints tokens with 2% slippage protection
  Returns transaction signature and explorer link.`,
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
  `Redeem inverse tokens back to USDC. Executes on-chain:
  1. Posts fresh Pyth price oracle update
  2. Burns tokens and returns USDC with 2% slippage protection
  Returns transaction signature and explorer link.`,
  {
    token_amount: z.number().positive().describe("Inverse token amount to redeem (e.g. 1.5)"),
    pool_id: poolIdParam,
  },
  async ({ token_amount, pool_id }) => ({
    content: [{ type: "text", text: await redeem(token_amount, pool_id) }],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
//  LP TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "add_liquidity",
  `Deposit USDC as liquidity provider. Receive LP tokens proportional to vault share.
  LP providers earn trading fees from all mints and redeems.
  Minimum deposit: $100 USDC.`,
  {
    usdc_amount: z.number().min(100).describe("USDC amount to deposit (minimum 100)"),
    pool_id: poolIdParam,
  },
  async ({ usdc_amount, pool_id }) => ({
    content: [{ type: "text", text: await addLiquidity(usdc_amount, pool_id) }],
  })
);

server.tool(
  "remove_liquidity",
  `Withdraw liquidity by burning LP tokens. Returns proportional USDC from vault.
  Requires Pyth price update for vault health check.`,
  {
    lp_shares: z.number().positive().describe("LP shares to burn (raw amount from get_position)"),
    pool_id: poolIdParam,
  },
  async ({ lp_shares, pool_id }) => ({
    content: [{ type: "text", text: await removeLiquidity(lp_shares, pool_id) }],
  })
);

server.tool(
  "claim_lp_fees",
  `Claim accumulated trading fees as LP provider.
  Transfers pending USDC fees from vault to wallet.`,
  { pool_id: poolIdParam },
  async ({ pool_id }) => ({
    content: [{ type: "text", text: await claimLpFees(pool_id) }],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
//  FAUCET
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "claim_usdc",
  `Claim 5,000 free devnet USDC from the on-chain faucet.
  Rate limited: 1 claim per 24 hours per wallet.
  Use this first before minting — you need USDC to trade.`,
  {},
  async () => ({
    content: [{ type: "text", text: await claimUsdc() }],
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
