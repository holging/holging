import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer } from "http";
import { randomUUID } from "crypto";

import {
  getPoolState, getSolPrice, getPosition, getAllPrices,
  mint, redeem, simulateMint, simulateRedeem,
  addLiquidity, removeLiquidity, claimLpFees,
  claimUsdc,
} from "./tools.js";
import { POOLS } from "./utils.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

function createMcpServer() {
  const server = new McpServer({
    name: "holging",
    version: "2.0.0",
  });

  const poolIds = Object.keys(POOLS);
  const poolIdParam = z.enum(poolIds as [string, ...string[]])
    .optional()
    .describe(`Pool ID: ${poolIds.join(", ")} (default: sol)`);

  // ═══════════════════════════════════════════════════════════════════════════
  //  READ-ONLY TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  SIMULATION TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  TRADING TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  LP TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  FAUCET
  // ═══════════════════════════════════════════════════════════════════════════

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

  return server;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HTTP SERVER
// ═══════════════════════════════════════════════════════════════════════════════

const transports = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      server: "holging-mcp",
      version: "2.0.0",
      tools: 12,
      pools: Object.keys(POOLS).length,
      endpoint: `/mcp`,
    }));
    return;
  }

  // MCP endpoint
  if (url.pathname === "/mcp") {
    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // New session (POST without session ID or with unknown session)
    if (req.method === "POST" && !sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      const server = createMcpServer();

      transport.onclose = () => {
        const sid = (transport as any)._sessionId;
        if (sid) transports.delete(sid);
      };

      await server.connect(transport);

      // Handle the initial request
      await transport.handleRequest(req, res);

      // Store the transport by session ID after first response
      const sid = (transport as any)._sessionId;
      if (sid) {
        transports.set(sid, transport);
      }
      return;
    }

    // Session not found
    if (sessionId && !transports.has(sessionId)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found. Start a new session with POST /mcp without session ID." }));
      return;
    }

    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad request" }));
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found. Use /mcp for MCP endpoint or / for health check." }));
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Holging MCP Server (HTTP) running on http://0.0.0.0:${PORT}`);
  console.log(`   MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`   Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`   Tools: 12 | Pools: ${Object.keys(POOLS).length} | Network: devnet`);
});
