// Minimal, dependency-light Ethereum helpers used to verify personal_sign signatures locally.
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

const strip0x = (h: string) => (h.startsWith("0x") || h.startsWith("0X") ? h.slice(2) : h);

export function utf8ToHex(text: string): `0x${string}` {
  return `0x${bytesToHex(utf8ToBytes(text))}`;
}

export function hexToUtf8(hex: string): string {
  return new TextDecoder().decode(hexToBytes(strip0x(hex)));
}

/** EIP-191 personal_sign digest: keccak256("\x19Ethereum Signed Message:\n" + len + message). */
export function hashPersonalMessage(message: string | Uint8Array): Uint8Array {
  const body = typeof message === "string" ? utf8ToBytes(message) : message;
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`);
  const all = new Uint8Array(prefix.length + body.length);
  all.set(prefix);
  all.set(body, prefix.length);
  return keccak_256(all);
}

/** EIP-55 checksummed address. */
export function toChecksumAddress(address: string): string {
  const lower = strip0x(address).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(lower)) throw new Error("Invalid address");
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
}

export function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function publicKeyToAddress(uncompressed: Uint8Array): string {
  // Drop the 0x04 prefix, hash the 64-byte key, keep the last 20 bytes.
  return toChecksumAddress(bytesToHex(keccak_256(uncompressed.slice(1)).slice(-20)));
}

/** Recover the signer of a personal_sign signature (65 bytes: r, s, v). */
export function recoverPersonalSigner(message: string, signature: string): string {
  const sig = hexToBytes(strip0x(signature));
  if (sig.length !== 65) throw new Error("Signature must be 65 bytes");
  let v = sig[64];
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("Invalid recovery id");
  const s = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v);
  const point = s.recoverPublicKey(hashPersonalMessage(message));
  return publicKeyToAddress(point.toRawBytes(false));
}

export function verifyPersonalSignature(message: string, signature: string, address: string): boolean {
  try {
    return recoverPersonalSigner(message, signature).toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
