import { useState } from "react";
import { POOLS } from "../config/pools";

const ENDPOINTS = [
  { method: "GET", path: "/prices", cat: "read", desc: "All 4 pool prices in one call", params: "—", example: "curl https://api.holging.com/prices" },
  { method: "GET", path: "/pool/:id", cat: "read", desc: "Detailed pool state — vault, fees, LP, coverage", params: ":id = sol | tsla | spy | aapl", example: "curl https://api.holging.com/pool/sol" },
  { method: "GET", path: "/position", cat: "read", desc: "Wallet balances: SOL, USDC, inverse tokens", params: "?wallet=...&pool=sol", example: "curl 'https://api.holging.com/position?wallet=ABC...&pool=sol'" },
  { method: "GET", path: "/simulate/mint", cat: "simulate", desc: "Preview mint — expected tokens & fee", params: "?amount=100&pool=sol", example: "curl 'https://api.holging.com/simulate/mint?amount=100&pool=sol'" },
  { method: "GET", path: "/simulate/redeem", cat: "simulate", desc: "Preview redeem — expected USDC & fee", params: "?amount=1.5&pool=sol", example: "curl 'https://api.holging.com/simulate/redeem?amount=1.5&pool=sol'" },
  { method: "POST", path: "/build/mint", cat: "trade", desc: "Build unsigned mint tx (USDC → tokens)", params: '{ wallet, amount, pool? }', example: 'curl -X POST https://api.holging.com/build/mint -H "Content-Type: application/json" -d \'{"wallet":"ABC...","amount":100}\'' },
  { method: "POST", path: "/build/redeem", cat: "trade", desc: "Build unsigned redeem tx (tokens → USDC)", params: '{ wallet, amount, pool? }', example: 'curl -X POST https://api.holging.com/build/redeem -d \'{"wallet":"ABC...","amount":1.5}\'' },
  { method: "POST", path: "/build/claim_usdc", cat: "faucet", desc: "Build unsigned tx — claim 5,000 devnet USDC", params: '{ wallet }', example: 'curl -X POST https://api.holging.com/build/claim_usdc -d \'{"wallet":"ABC..."}\'' },
  { method: "POST", path: "/build/add_liquidity", cat: "lp", desc: "Build unsigned LP deposit tx (min $100)", params: '{ wallet, amount, pool? }', example: 'curl -X POST https://api.holging.com/build/add_liquidity -d \'{"wallet":"ABC...","amount":500}\'' },
  { method: "POST", path: "/build/remove_liquidity", cat: "lp", desc: "Build unsigned LP withdrawal tx", params: '{ wallet, lp_shares, pool? }', example: 'curl -X POST https://api.holging.com/build/remove_liquidity -d \'{"wallet":"ABC...","lp_shares":1000000}\'' },
  { method: "POST", path: "/build/claim_lp_fees", cat: "lp", desc: "Build unsigned LP fee claim tx", params: '{ wallet, pool? }', example: 'curl -X POST https://api.holging.com/build/claim_lp_fees -d \'{"wallet":"ABC...","pool":"sol"}\'' },
];

const CATEGORIES: Record<string, { label: string; color: string; icon: string }> = {
  read: { label: "READ", color: "#00d4aa", icon: "📖" },
  simulate: { label: "SIMULATE", color: "#ffb347", icon: "🧪" },
  trade: { label: "TRADE", color: "#ff6b6b", icon: "⚡" },
  faucet: { label: "FAUCET", color: "#ff79c6", icon: "🚰" },
  lp: { label: "LP", color: "#7c83ff", icon: "💧" },
};

const POOLS_LIST = Object.entries(POOLS).map(([id, p]) => ({
  id, name: p.name, asset: p.asset, icon: p.icon,
}));

const CODE_SAMPLE = `// 1. Get unsigned tx from API
const res = await fetch("https://api.holging.com/build/mint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet: keypair.publicKey.toBase58(), amount: 100 }),
});
const { tx } = await res.json();

// 2. Decode and sign locally (private key never leaves your machine)
const transaction = Transaction.from(Buffer.from(tx, "base64"));
transaction.sign(keypair);

// 3. Submit to Solana
const sig = await connection.sendRawTransaction(transaction.serialize());`;

export function McpPage() {
  const [expandedEp, setExpandedEp] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = filter ? ENDPOINTS.filter(e => e.cat === filter) : ENDPOINTS;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mcp-page">
      <h2>⚡ Agent API</h2>
      <p className="form-desc">
        Transaction Builder API — we build unsigned transactions, your agent signs locally.
        Private keys never leave your machine.
      </p>

      {/* Base URL */}
      <div className="mcp-hero">
        <div className="mcp-stat" style={{ flex: 2 }}>
          <code className="mcp-stat-value" style={{ fontSize: "1em", letterSpacing: 0 }}>https://api.holging.com</code>
          <span className="mcp-stat-label">Base URL</span>
        </div>
        <div className="mcp-stat">
          <span className="mcp-stat-value">{ENDPOINTS.length}</span>
          <span className="mcp-stat-label">Endpoints</span>
        </div>
        <div className="mcp-stat">
          <span className="mcp-stat-value">{POOLS_LIST.length}</span>
          <span className="mcp-stat-label">Pools</span>
        </div>
        <div className="mcp-stat">
          <span className="mcp-stat-value">Devnet</span>
          <span className="mcp-stat-label">Network</span>
        </div>
      </div>

      {/* Pools */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">Pools</h3>
        <div className="mcp-pools">
          {POOLS_LIST.map(p => (
            <span key={p.id} className="mcp-pool-chip">
              {p.icon} {p.name} <code className="mcp-pool-id">{p.id}</code>
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">How It Works</h3>
        <div className="mcp-workflow">
          <div className="mcp-workflow-step">
            <span className="mcp-step-num">1</span>
            <span className="mcp-step-text">Agent calls <code>GET /prices</code> or <code>GET /simulate/mint</code></span>
          </div>
          <div className="mcp-workflow-arrow">→</div>
          <div className="mcp-workflow-step">
            <span className="mcp-step-num">2</span>
            <span className="mcp-step-text">Agent calls <code>POST /build/mint</code> with wallet address</span>
          </div>
          <div className="mcp-workflow-arrow">→</div>
          <div className="mcp-workflow-step">
            <span className="mcp-step-num">3</span>
            <span className="mcp-step-text"><strong>Signs tx locally</strong> — key never sent</span>
          </div>
          <div className="mcp-workflow-arrow">→</div>
          <div className="mcp-workflow-step">
            <span className="mcp-step-num">4</span>
            <span className="mcp-step-text">Submits to Solana RPC</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">Endpoints</h3>
        <div className="mcp-filters">
          <button className={`mcp-filter-btn ${filter === null ? "active" : ""}`} onClick={() => setFilter(null)}>
            All ({ENDPOINTS.length})
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              className={`mcp-filter-btn ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(filter === key ? null : key)}
              style={{ "--cat-color": cat.color } as React.CSSProperties}
            >
              {cat.icon} {cat.label} ({ENDPOINTS.filter(e => e.cat === key).length})
            </button>
          ))}
        </div>
      </div>

      {/* Endpoints list */}
      <div className="mcp-tools">
        {filtered.map(ep => {
          const key = ep.method + ep.path;
          const isExpanded = expandedEp === key;
          return (
            <div
              key={key}
              className={`mcp-tool ${isExpanded ? "expanded" : ""}`}
              onClick={() => setExpandedEp(isExpanded ? null : key)}
            >
              <div className="mcp-tool-header">
                <span className={`mcp-method mcp-method-${ep.method.toLowerCase()}`}>{ep.method}</span>
                <code className="mcp-tool-name">{ep.path}</code>
                <span className="mcp-tool-desc">{ep.desc}</span>
                <span className="mcp-tool-chevron">{isExpanded ? "▼" : "▶"}</span>
              </div>
              {isExpanded && (
                <div className="mcp-tool-detail">
                  <div className="mcp-tool-row">
                    <span className="mcp-tool-label">Params:</span>
                    <code>{ep.params}</code>
                  </div>
                  <div className="mcp-tool-row">
                    <span className="mcp-tool-label">Example:</span>
                    <div style={{ display: "flex", gap: "0.5em", alignItems: "flex-start", flex: 1 }}>
                      <pre className="mcp-tool-example" style={{ flex: 1 }}>{ep.example}</pre>
                      <button
                        className="mcp-copy-btn"
                        style={{ flexShrink: 0 }}
                        onClick={(e) => { e.stopPropagation(); handleCopy(ep.example, key); }}
                      >
                        {copied === key ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Code sample */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">TypeScript Example</h3>
        <div className="mcp-config-block">
          <pre>{CODE_SAMPLE}</pre>
          <button
            className="mcp-copy-btn"
            onClick={() => handleCopy(CODE_SAMPLE, "code")}
          >
            {copied === "code" ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Links */}
      <div className="mcp-section">
        <h3 className="mcp-section-title">Links</h3>
        <div className="mcp-compat">
          <a href="https://api.holging.com" target="_blank" rel="noopener noreferrer" className="mcp-compat-item">📡 API Health</a>
          <a href="https://github.com/holging/holging" target="_blank" rel="noopener noreferrer" className="mcp-compat-item">📦 GitHub</a>
          <a href="https://github.com/holging/holging/blob/main/mcp-server/README.md" target="_blank" rel="noopener noreferrer" className="mcp-compat-item">📖 Full Docs</a>
        </div>
      </div>
    </div>
  );
}
