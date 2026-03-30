import { useState } from "react";
import { POOLS } from "../config/pools";

const TOOLS = [
  {
    name: "get_pool_state",
    category: "read",
    desc: "Pool state: vault, coverage, prices, fees, LP stats",
    params: "pool_id?",
    example: '{ "pool_id": "sol" }',
  },
  {
    name: "get_price",
    category: "read",
    desc: "Live asset + inverse token price from Pyth oracle",
    params: "pool_id?",
    example: '{ "pool_id": "tsla" }',
  },
  {
    name: "get_all_prices",
    category: "read",
    desc: "All pools in one call — prices, circulating, vault",
    params: "—",
    example: "{}",
  },
  {
    name: "get_position",
    category: "read",
    desc: "Wallet balances: SOL, USDC, inverse tokens, LP",
    params: "wallet_address?, pool_id?",
    example: '{ "wallet_address": "66HB...sDYs" }',
  },
  {
    name: "simulate_mint",
    category: "simulate",
    desc: "Preview mint output & fees — no transaction",
    params: "usdc_amount, pool_id?",
    example: '{ "usdc_amount": 100 }',
  },
  {
    name: "simulate_redeem",
    category: "simulate",
    desc: "Preview redeem output & fees — no transaction",
    params: "token_amount, pool_id?",
    example: '{ "token_amount": 1.5 }',
  },
  {
    name: "mint",
    category: "trade",
    desc: "Mint inverse tokens by depositing USDC (on-chain)",
    params: "usdc_amount, pool_id?",
    example: '{ "usdc_amount": 50, "pool_id": "sol" }',
  },
  {
    name: "redeem",
    category: "trade",
    desc: "Redeem inverse tokens back to USDC (on-chain)",
    params: "token_amount, pool_id?",
    example: '{ "token_amount": 1.0, "pool_id": "sol" }',
  },
  {
    name: "add_liquidity",
    category: "lp",
    desc: "Deposit USDC as LP — earn trading fees",
    params: "usdc_amount (min 100), pool_id?",
    example: '{ "usdc_amount": 500 }',
  },
  {
    name: "remove_liquidity",
    category: "lp",
    desc: "Withdraw liquidity by burning LP tokens",
    params: "lp_shares, pool_id?",
    example: '{ "lp_shares": 1000000 }',
  },
  {
    name: "claim_lp_fees",
    category: "lp",
    desc: "Claim accumulated trading fees as LP",
    params: "pool_id?",
    example: '{ "pool_id": "sol" }',
  },
];

const CATEGORIES: Record<string, { label: string; color: string; icon: string }> = {
  read: { label: "READ", color: "#00d4aa", icon: "📖" },
  simulate: { label: "SIMULATE", color: "#ffb347", icon: "🧪" },
  trade: { label: "TRADE", color: "#ff6b6b", icon: "⚡" },
  lp: { label: "LP", color: "#7c83ff", icon: "💧" },
};

const MCP_CONFIG = {
  server: "holging",
  version: "2.0.0",
  transport: "stdio",
  config: `{
  "mcpServers": {
    "holging": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "env": {
        "RPC_URL": "https://api.devnet.solana.com",
        "ANCHOR_WALLET": "~/solana-wallet.json",
        "USDC_MINT": "CAMk3KqYMKEtoQnsDyJMmdKUfvh5wa4uYSJvUTDheeGn"
      }
    }
  }
}`,
};

const POOLS_LIST = Object.entries(POOLS).map(([id, p]) => ({
  id,
  name: p.name,
  asset: p.asset,
  icon: p.icon,
}));

export function McpPage() {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const filteredTools = filter
    ? TOOLS.filter((t) => t.category === filter)
    : TOOLS;

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(MCP_CONFIG.config);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  return (
    <div className="mcp-page">
      <h2>MCP Server</h2>
      <p className="form-desc">
        Model Context Protocol — connect AI agents to trade on Holging
      </p>

      {/* Hero stats */}
      <div className="mcp-hero">
        <div className="mcp-stat">
          <span className="mcp-stat-value">11</span>
          <span className="mcp-stat-label">Tools</span>
        </div>
        <div className="mcp-stat">
          <span className="mcp-stat-value">{POOLS_LIST.length}</span>
          <span className="mcp-stat-label">Pools</span>
        </div>
        <div className="mcp-stat">
          <span className="mcp-stat-value">v{MCP_CONFIG.version}</span>
          <span className="mcp-stat-label">Version</span>
        </div>
        <div className="mcp-stat">
          <span className="mcp-stat-value">Devnet</span>
          <span className="mcp-stat-label">Network</span>
        </div>
      </div>

      {/* Supported pools */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">Supported Pools</h3>
        <div className="mcp-pools">
          {POOLS_LIST.map((p) => (
            <span key={p.id} className="mcp-pool-chip">
              {p.icon} {p.name}
              <code className="mcp-pool-id">{p.id}</code>
            </span>
          ))}
        </div>
      </div>

      {/* Setup config */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">Quick Setup</h3>
        <p className="mcp-hint">
          Add to <code>.mcp.json</code> in your project root:
        </p>
        <div className="mcp-config-block">
          <pre>{MCP_CONFIG.config}</pre>
          <button
            className="mcp-copy-btn"
            onClick={handleCopyConfig}
          >
            {copiedConfig ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Tool categories filter */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">Tools</h3>
        <div className="mcp-filters">
          <button
            className={`mcp-filter-btn ${filter === null ? "active" : ""}`}
            onClick={() => setFilter(null)}
          >
            All ({TOOLS.length})
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              className={`mcp-filter-btn ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(filter === key ? null : key)}
              style={{ "--cat-color": cat.color } as React.CSSProperties}
            >
              {cat.icon} {cat.label} ({TOOLS.filter((t) => t.category === key).length})
            </button>
          ))}
        </div>
      </div>

      {/* Tools list */}
      <div className="mcp-tools">
        {filteredTools.map((tool) => {
          const cat = CATEGORIES[tool.category];
          const isExpanded = expandedTool === tool.name;
          return (
            <div
              key={tool.name}
              className={`mcp-tool ${isExpanded ? "expanded" : ""}`}
              onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
            >
              <div className="mcp-tool-header">
                <span
                  className="mcp-tool-badge"
                  style={{ background: cat.color + "22", color: cat.color }}
                >
                  {cat.icon} {cat.label}
                </span>
                <code className="mcp-tool-name">{tool.name}</code>
                <span className="mcp-tool-desc">{tool.desc}</span>
                <span className="mcp-tool-chevron">{isExpanded ? "▼" : "▶"}</span>
              </div>
              {isExpanded && (
                <div className="mcp-tool-detail">
                  <div className="mcp-tool-row">
                    <span className="mcp-tool-label">Params:</span>
                    <code>{tool.params}</code>
                  </div>
                  <div className="mcp-tool-row">
                    <span className="mcp-tool-label">Example:</span>
                    <pre className="mcp-tool-example">{tool.example}</pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Agent integration examples */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">Agent Workflow Example</h3>
        <div className="mcp-workflow">
          <div className="mcp-workflow-step">
            <span className="mcp-step-num">1</span>
            <span className="mcp-step-text">
              <code>get_all_prices</code> → Scan market
            </span>
          </div>
          <div className="mcp-workflow-arrow">→</div>
          <div className="mcp-workflow-step">
            <span className="mcp-step-num">2</span>
            <span className="mcp-step-text">
              <code>simulate_mint</code> → Preview trade
            </span>
          </div>
          <div className="mcp-workflow-arrow">→</div>
          <div className="mcp-workflow-step">
            <span className="mcp-step-num">3</span>
            <span className="mcp-step-text">
              <code>mint</code> → Execute on-chain
            </span>
          </div>
          <div className="mcp-workflow-arrow">→</div>
          <div className="mcp-workflow-step">
            <span className="mcp-step-num">4</span>
            <span className="mcp-step-text">
              <code>get_position</code> → Verify
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
