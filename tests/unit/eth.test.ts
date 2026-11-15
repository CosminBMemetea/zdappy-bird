import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";
import {
  hashPersonalMessage,
  hexToUtf8,
  isAddress,
  publicKeyToAddress,
  recoverPersonalSigner,
  shortAddress,
  toChecksumAddress,
  utf8ToHex,
  verifyPersonalSignature,
} from "../../src/web3/eth";

// Throwaway key generated fresh for every run; never a real or committed key.
function randomSigner() {
  const priv = secp256k1.utils.randomPrivateKey();
  const address = publicKeyToAddress(secp256k1.getPublicKey(priv, false));
  const sign = (message: string) => {
    const sig = secp256k1.sign(hashPersonalMessage(message), priv);
    return `0x${bytesToHex(sig.toCompactRawBytes())}${(27 + sig.recovery).toString(16)}`;
  };
  return { address, sign };
}

describe("eth helpers", () => {
  it("hashes personal messages per EIP-191 (known vector)", () => {
    expect(bytesToHex(hashPersonalMessage("hello world"))).toBe(
      // secret-scan: public-value (published EIP-191 hash of "hello world")
      "d9eba16ed0ecae432b71fe008c98cc872bb4cc214d3220a36f365326cf807d68"
    );
  });

  it("checksums addresses per EIP-55 (spec vectors)", () => {
    for (const a of [
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
      "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
      "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
    ]) {
      expect(toChecksumAddress(a.toLowerCase())).toBe(a);
    }
    expect(() => toChecksumAddress("0x1234")).toThrow();
  });

  it("round-trips UTF-8 through hex", () => {
    const text = "Zdappy 🐤\nScore: 7";
    expect(hexToUtf8(utf8ToHex(text))).toBe(text);
  });

  it("recovers the signer and verifies a valid signature", () => {
    const { address, sign } = randomSigner();
    const msg = "Zdappy Bird score\nScore: 3";
    const sig = sign(msg);
    expect(recoverPersonalSigner(msg, sig)).toBe(address);
    expect(verifyPersonalSignature(msg, sig, address)).toBe(true);
    expect(verifyPersonalSignature(msg, sig, address.toLowerCase())).toBe(true);
  });

  it("rejects a signature over a different message or from another key", () => {
    const a = randomSigner();
    const b = randomSigner();
    const msg = "Score: 5";
    expect(verifyPersonalSignature("Score: 50", a.sign(msg), a.address)).toBe(false);
    expect(verifyPersonalSignature(msg, b.sign(msg), a.address)).toBe(false);
  });

  it("never throws on malformed signatures", () => {
    const { address } = randomSigner();
    for (const bad of ["", "0x", "0x1234", `0x${"00".repeat(65)}`, `0x${"ff".repeat(64)}1f`, "not hex"]) {
      expect(verifyPersonalSignature("m", bad, address)).toBe(false);
    }
  });

  it("validates and shortens addresses", () => {
    expect(isAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe(true);
    expect(isAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe")).toBe(false);
    expect(isAddress(42)).toBe(false);
    expect(shortAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe("0x5aAe…eAed");
  });
});
