import { TARGET_CHAIN } from "./config";

export interface ScoreClaim {
  score: number;
  address: string;
  chainId: number;
  issuedAt: Date;
}

/**
 * The exact text the player signs. It is shown in full before signing, and the
 * wallet receives these bytes and nothing else (no hidden payload).
 */
export function buildScoreMessage({ score, address, chainId, issuedAt }: ScoreClaim): string {
  if (!Number.isSafeInteger(score) || score < 0) throw new Error("Score must be a non-negative integer");
  return [
    "Zdappy Bird score",
    "",
    `Score: ${score}`,
    `Player: ${address}`,
    `Network: ${chainId === TARGET_CHAIN.id ? TARGET_CHAIN.name : "Chain"} (${chainId})`,
    `Issued: ${issuedAt.toISOString()}`,
    "",
    "Signing proves this wallet claimed this score in your browser.",
    "It is free, sends no transaction, and is not uploaded anywhere.",
  ].join("\n");
}
