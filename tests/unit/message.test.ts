import { describe, expect, it } from "vitest";
import { buildScoreMessage } from "../../src/web3/message";

const address = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const issuedAt = new Date("2026-11-15T17:00:00.000Z");

describe("score message", () => {
  it("has exactly the documented content", () => {
    expect(buildScoreMessage({ score: 7, address, chainId: 11155111, issuedAt })).toBe(
      [
        "Zdappy Bird score",
        "",
        "Score: 7",
        `Player: ${address}`,
        "Network: Sepolia (11155111)",
        "Issued: 2026-11-15T17:00:00.000Z",
        "",
        "Signing proves this wallet claimed this score in your browser.",
        "It is free, sends no transaction, and is not uploaded anywhere.",
      ].join("\n")
    );
  });

  it("contains only printable ASCII and newlines (no hidden payload)", () => {
    const msg = buildScoreMessage({ score: 123, address, chainId: 11155111, issuedAt });
    expect(/^[\x20-\x7e\n]+$/.test(msg)).toBe(true);
  });

  it("rejects invalid scores", () => {
    for (const score of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
      expect(() => buildScoreMessage({ score, address, chainId: 11155111, issuedAt })).toThrow();
    }
  });
});
