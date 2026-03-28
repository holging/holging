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
    feedId: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
    icon: "🚗",
    decimals: 9,
  },
  spy: {
    poolId: "spy",
    name: "shortSPY",
    asset: "SPY",
    feedId: "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
    icon: "📈",
    decimals: 9,
  },
  aapl: {
    poolId: "aapl",
    name: "shortAAPL",
    asset: "AAPL",
    feedId: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
    icon: "🍎",
    decimals: 9,
  },
};

export const DEFAULT_POOL_ID = "sol";
export const POOL_IDS = Object.keys(POOLS);
