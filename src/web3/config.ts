// Optional web3 settings. Everything here is public; there are no keys or secrets.

/** The only network the app works with: Sepolia testnet. */
export const TARGET_CHAIN = {
  id: 11155111,
  hexId: "0xaa36a7",
  name: "Sepolia",
  // Passed to the wallet only if it doesn't know Sepolia yet. The page itself never calls it.
  rpcUrls: ["https://rpc.sepolia.org"],
  explorer: "https://sepolia.etherscan.io",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
} as const;

/**
 * Address of a deployed Zdappy Bird contract on Sepolia, or null.
 * No contract has been deployed yet, so on-chain actions stay disabled.
 * See README > "Optional web3" for how to deploy one and fill this in.
 */
export const ZDAPPY_CONTRACT_ADDRESS: `0x${string}` | null = null;

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  84532: "Base Sepolia",
  11155111: "Sepolia",
};

export function chainName(id: number | null): string {
  if (id === null) return "Unknown network";
  return CHAIN_NAMES[id] ?? `Chain ${id}`;
}
