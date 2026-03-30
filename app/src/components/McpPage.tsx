import { useState } from "react";
import { POOLS } from "../config/pools";

const TOOLS = [
  {
    name: "claim_usdc",
    category: "faucet",
    desc: "Claim 5,000 free devnet USDC — run this first!",
    params: "—",
    example: "{}",
  },
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
  faucet: { label: "FAUCET", color: "#ff79c6", icon: "🚰" },
  read: { label: "READ", color: "#00d4aa", icon: "📖" },
  simulate: { label: "SIMULATE", color: "#ffb347", icon: "🧪" },
  trade: { label: "TRADE", color: "#ff6b6b", icon: "⚡" },
  lp: { label: "LP", color: "#7c83ff", icon: "💧" },
};

const STRATEGIES = [
  {
    name: "Holging Rebalance",
    icon: "⚖️",
    risk: "Low",
    desc: "50% SOL + 50% shortSOL. Mathematically guaranteed profit from volatility. Rebalance when ratio drifts >60/40.",
    steps: [
      "get_all_prices → check SOL price",
      "get_position → check SOL vs shortSOL ratio",
      "If ratio drifts >60/40 → simulate_mint or simulate_redeem",
      "mint or redeem → rebalance to 50/50",
      "Repeat every 1–24 hours",
    ],
    pnl: "+25% on ±50% SOL move, +4.2% on ±25%",
  },
  {
    name: "Momentum Short",
    icon: "📉",
    risk: "Medium",
    desc: "Short assets showing downward momentum. Enter when asset drops >5% in 24h, exit on 3% recovery.",
    steps: [
      "get_all_prices → scan SOL, TSLA, SPY, AAPL",
      "Track 24h change → find biggest dropper",
      "simulate_mint → preview short entry",
      "mint → enter inverse position",
      "Monitor get_price → exit when asset recovers 3%",
    ],
    pnl: "Variable — depends on trend continuation",
  },
  {
    name: "LP Yield Farming",
    icon: "🌾",
    risk: "Low",
    desc: "Provide liquidity to earn trading fees. Monitor vault health, exit if coverage drops below 130%.",
    steps: [
      "get_pool_state → check coverage ratio (want >200%)",
      "add_liquidity → deposit USDC (min $100)",
      "claim_lp_fees → collect fees weekly",
      "If coverage <130% → remove_liquidity (safety exit)",
    ],
    pnl: "Fee yield from all mint/redeem volume",
  },
  {
    name: "Multi-Asset Scanner",
    icon: "🔍",
    risk: "Medium",
    desc: "Scan all 4 pools, short the asset with highest recent volatility. Ride momentum across markets.",
    steps: [
      "get_all_prices → compare all assets",
      "Pick highest volatility → simulate_mint on that pool",
      "mint → enter position",
      "Set target: 5% profit → monitor with get_price",
      "redeem when target hit → rotate to next asset",
    ],
    pnl: "Variable — captures cross-asset opportunities",
  },
];

const MCP_CONFIG = `{
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
}`;

const POOLS_LIST = Object.entries(POOLS).map(([id, p]) => ({
  id,
  name: p.name,
  asset: p.asset,
  icon: p.icon,
}));

export function McpPage() {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [section, setSection] = useState<"tools" | "strategies" | "setup">("strategies");

  const filteredTools = filter
    ? TOOLS.filter((t) => t.category === filter)
    : TOOLS;

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(MCP_CONFIG);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  return (
    <div className="mcp-page">
      <h2>🤖 AI Agent Trading</h2>
      <p className="form-desc">
        Connect your AI agent to trade inverse tokens, run the Holging strategy, and earn LP fees — via MCP protocol
      </p>

      {/* Hero stats */}
      <div className="mcp-hero">
        <div className="mcp-stat">
          <span className="mcp-stat-value">12</span>
          <span className="mcp-stat-label">Tools</span>
        </div>
        <div className="mcp-stat">
          <span className="mcp-stat-value">{POOLS_LIST.length}</span>
          <span className="mcp-stat-label">Pools</span>
        </div>
        <div className="mcp-stat">
          <span className="mcp-stat-value">{STRATEGIES.length}</span>
          <span className="mcp-stat-label">Strategies</span>
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

      {/* Section tabs */}
      <div className="mcp-section-tabs">
        <button
          className={`mcp-section-tab ${section === "strategies" ? "active" : ""}`}
          onClick={() => setSection("strategies")}
        >
          🎯 Strategies
        </button>
        <button
          className={`mcp-section-tab ${section === "tools" ? "active" : ""}`}
          onClick={() => setSection("tools")}
        >
          🔧 Tools
        </button>
        <button
          className={`mcp-section-tab ${section === "setup" ? "active" : ""}`}
          onClick={() => setSection("setup")}
        >
          ⚡ Setup
        </button>
      </div>

      {/* ─── STRATEGIES SECTION ─────────────────────────────── */}
      {section === "strategies" && (
        <div className="mcp-section">
          <h3 className="mcp-section-title">Agent Strategies</h3>
          <p className="mcp-hint">Ready-made trading strategies for your AI agent. Click to expand.</p>
          <div className="mcp-strategies">
            {STRATEGIES.map((strat) => {
              const isExpanded = expandedStrategy === strat.name;
              return (
                <div
                  key={strat.name}
                  className={`mcp-strategy ${isExpanded ? "expanded" : ""}`}
                  onClick={() => setExpandedStrategy(isExpanded ? null : strat.name)}
                >
                  <div className="mcp-strategy-header">
                    <span className="mcp-strategy-icon">{strat.icon}</span>
                    <div className="mcp-strategy-info">
                      <span className="mcp-strategy-name">{strat.name}</span>
                      <span className={`mcp-strategy-risk risk-${strat.risk.toLowerCase()}`}>
                        {strat.risk} Risk
                      </span>
                    </div>
                    <span className="mcp-tool-chevron">{isExpanded ? "▼" : "▶"}</span>
                  </div>
                  <p className="mcp-strategy-desc">{strat.desc}</p>
                  {isExpanded && (
                    <div className="mcp-strategy-detail">
                      <div className="mcp-strategy-steps">
                        <strong>Agent Workflow:</strong>
                        {strat.steps.map((step, i) => (
                          <div key={i} className="mcp-workflow-step">
                            <span className="mcp-step-num">{i + 1}</span>
                            <span className="mcp-step-text">
                              <code>{step.split(" → ")[0]}</code>
                              {step.includes(" → ") && ` → ${step.split(" → ")[1]}`}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mcp-strategy-pnl">
                        <strong>Expected P&L:</strong> {strat.pnl}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick example */}
          <div className="mcp-example-box">
            <h4>💬 Try Saying to Your Agent</h4>
            <div className="mcp-example-prompts">
              <code>"Scan all Holging prices and tell me which asset has the best short opportunity"</code>
              <code>"Enter a holging position with $500 on SOL — 50/50 split"</code>
              <code>"Check my positions and rebalance if ratio drifted past 60/40"</code>
              <code>"Add $100 liquidity to the SOL pool and start earning fees"</code>
              <code>"Simulate redeeming all my shortTSLA and show me the P&L"</code>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOOLS SECTION ──────────────────────────────────── */}
      {section === "tools" && (
        <div className="mcp-section">
          <h3 className="mcp-section-title">All 12 Tools</h3>
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
        </div>
      )}

      {/* ─── SETUP SECTION ──────────────────────────────────── */}
      {section === "setup" && (
        <div className="mcp-section">
          <h3 className="mcp-section-title">Quick Setup</h3>

          <div className="mcp-setup-steps">
            <div className="mcp-setup-step">
              <span className="mcp-setup-num">1</span>
              <div>
                <strong>Clone & build</strong>
                <pre className="mcp-code-small">git clone https://github.com/holging/holging.git{"\n"}cd holging/mcp-server && npm install && npm run build</pre>
              </div>
            </div>

            <div className="mcp-setup-step">
              <span className="mcp-setup-num">2</span>
              <div>
                <strong>Create wallet</strong>
                <pre className="mcp-code-small">solana-keygen new -o ~/holging-agent-wallet.json{"\n"}solana airdrop 2 ~/holging-agent-wallet.json</pre>
              </div>
            </div>

            <div className="mcp-setup-step">
              <span className="mcp-setup-num">3</span>
              <div>
                <strong>Add to your AI tool</strong>
                <p className="mcp-hint" style={{ margin: "0.5em 0" }}>
                  Add to <code>.mcp.json</code> (Claude Code / Cursor):
                </p>
                <div className="mcp-config-block">
                  <pre>{MCP_CONFIG}</pre>
                  <button className="mcp-copy-btn" onClick={handleCopyConfig}>
                    {copiedConfig ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mcp-setup-step">
              <span className="mcp-setup-num">4</span>
              <div>
                <strong>Start trading!</strong>
                <p className="mcp-hint">
                  Tell your agent: <code>"Check Holging prices and mint 100 USDC of shortSOL"</code>
                </p>
              </div>
            </div>
          </div>

          {/* Compatibility */}
          <h3 className="mcp-section-title" style={{ marginTop: "2em" }}>Compatible AI Tools</h3>
          <div className="mcp-compat">
            <span className="mcp-compat-item">✅ Claude Code</span>
            <span className="mcp-compat-item">✅ Claude Desktop</span>
            <span className="mcp-compat-item">✅ Cursor</span>
            <span className="mcp-compat-item">✅ Windsurf</span>
            <span className="mcp-compat-item">✅ Any MCP client</span>
          </div>
        </div>
      )}
    </div>
  );
}
