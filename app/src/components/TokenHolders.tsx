import { useTokenHolders } from "../hooks/useTokenHolders";
import { SHORTSOL_DECIMALS } from "../utils/math";
import { deriveShortsolMintPda } from "../utils/program";

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function TokenHolders() {
  const { holders, totalSupply, loading, error } = useTokenHolders();
  const [shortsolMint] = deriveShortsolMintPda();
  const mintAddr = shortsolMint.toBase58();

  return (
    <div className="form-card holders-card">
      <h3>shortSOL Holders</h3>

      <div className="holders-summary">
        <div className="holders-stat">
          <span className="holders-stat-label">Total Supply</span>
          <span className="holders-stat-value">
            {totalSupply.toFixed(SHORTSOL_DECIMALS > 4 ? 4 : SHORTSOL_DECIMALS)} sSol
          </span>
        </div>
        <div className="holders-stat">
          <span className="holders-stat-label">Holders</span>
          <span className="holders-stat-value">{holders.length}</span>
        </div>
        <div className="holders-stat">
          <span className="holders-stat-label">Mint</span>
          <span className="holders-stat-value">
            <a
              href={`https://solscan.io/token/${mintAddr}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="holder-link"
            >
              {shortenAddress(mintAddr)}
            </a>
          </span>
        </div>
      </div>

      {loading && <p className="holders-loading">Loading holders...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && holders.length === 0 && (
        <p className="holders-empty">No holders yet</p>
      )}

      {holders.length > 0 && (
        <div className="holders-table">
          <div className="holders-header">
            <span className="holder-rank">#</span>
            <span className="holder-address">Address</span>
            <span className="holder-balance">Balance</span>
            <span className="holder-pct">Share</span>
          </div>
          {holders.map((h, i) => (
            <div key={h.address} className="holder-row">
              <span className="holder-rank">{i + 1}</span>
              <span className="holder-address">
                <a
                  href={`https://solscan.io/account/${h.address}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="holder-link"
                >
                  {shortenAddress(h.address)}
                </a>
              </span>
              <span className="holder-balance">
                {h.balance.toFixed(4)} sSol
              </span>
              <span className="holder-pct">{h.percentage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
