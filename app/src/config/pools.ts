export interface PoolConfig {
  poolId: string;
  name: string;       // Display name for the inverse token
  asset: string;      // Underlying asset name
  feedId: string;     // Pyth price feed ID (hex)
  icon: string;       // Emoji icon
  decimals: number;   // Token decimals (9 for SOL-like, 9 for stock tokens)
}

export const POOLS: Record<string, PoolConfig> = {
  sol: {
    poolId: "sol",
    name: "shortSOL",
    asset: "SOL",
    feedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    icon: "◎",
    decimals: 9,
  },
  tsla: {
    poolId: "tsla",
    name: "shortTSLA",
    asset: "TSLA",
    feedId: "21f0ff0908319a6880012b91d64e71c1902b8724018e7f1a8fc63d2b4f0e45e1",
    icon: "🚗",
    decimals: 9,
  },
  spy: {
    poolId: "spy",
    name: "shortSPY",
    asset: "SPY",
    feedId: "738d7ecd1c707260b132137ad1bb303286588ce64befe17a27238fdca6bac33f",
    icon: "📈",
    decimals: 9,
  },
  aapl: {
    poolId: "aapl",
    name: "shortAAPL",
    asset: "AAPL",
    feedId: "8ac0c70fff57e9aefdf5edf44b51d62c03e56bce0bfd84a02e7eb6f139ead3c0",
    icon: "🍎",
    decimals: 9,
  },
};

export const DEFAULT_POOL_ID = "sol";
export const POOL_IDS = Object.keys(POOLS);
