#!/usr/bin/env node
// Secret scan for the repo, its git history, and the built bundle.
// 1) gitleaks over the git history and the working tree (incl. public/build).
// 2) Extra patterns gitleaks doesn't cover well for web3 projects.
// Exits non-zero on any finding. Findings are printed redacted.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`✗ ${msg}`);
};

// --- 1. gitleaks -----------------------------------------------------------
const gitleaks = [process.env.GITLEAKS_BIN, "gitleaks", join(homedir(), ".local/bin/gitleaks")].find((bin) => {
  if (!bin) return false;
  return spawnSync(bin, ["version"], { stdio: "ignore" }).status === 0;
});
if (!gitleaks) {
  fail("gitleaks not found. Install it (https://github.com/gitleaks/gitleaks) or set GITLEAKS_BIN.");
} else {
  for (const args of [
    ["git", "--redact", "--no-banner", "--exit-code", "1", "."],
    ["dir", "--redact", "--no-banner", "--exit-code", "1", "public"],
    ["dir", "--redact", "--no-banner", "--exit-code", "1", "src"],
  ]) {
    const r = spawnSync(gitleaks, args, { stdio: "inherit" });
    if (r.status !== 0) fail(`gitleaks ${args[0]} ${args.at(-1)} reported findings`);
    else console.log(`✓ gitleaks ${args[0]} ${args.at(-1)}`);
  }
}

// --- 2. extra patterns -------------------------------------------------------
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
const files = [...new Set([...tracked, "public/build/bundle.js", "public/build/bundle.css"])].filter(
  (f) => existsSync(f) && !/(^|\/)package-lock\.json$|\.(png|jpe?g|gif|ico|webp|woff2?)$/i.test(f)
);

const patterns = [
  // 32-byte hex secrets (private keys) in our own source. The bundle is excluded:
  // vendored crypto libraries legitimately contain curve constants of that length.
  { name: "64-hex string (possible private key)", re: /(?<![0-9a-fA-F])(0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/g, skipBundle: true },
  { name: "Infura project id in URL", re: /infura\.io\/v3\/[0-9a-f]{32}/gi },
  { name: "Alchemy key in URL", re: /alchemy(api)?\.(com|io)\/v2\/[A-Za-z0-9_-]{20,}/gi },
  { name: "WalletConnect projectId", re: /projectId\s*[:=]\s*["'][0-9a-f]{32}["']/gi },
  { name: "Etherscan-style API key", re: /(etherscan|polygonscan|bscscan)[^\n]{0,40}api[-_]?key\s*[:=]\s*["'][A-Z0-9]{34}["']/gi },
  { name: "PRIVATE_KEY / MNEMONIC assignment", re: /\b(PRIVATE_KEY|MNEMONIC|SEED_PHRASE)\s*[:=]\s*["'][^"'\s]{12,}["']/g },
  // 12 or 24 consecutive lowercase words of 3-8 letters in quotes: likely a seed phrase.
  { name: "possible mnemonic phrase", re: /["'`](?:[a-z]{3,8}\s){11}(?:[a-z]{3,8}\s){0,12}[a-z]{3,8}["'`]/g },
];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const isBundle = file.startsWith("public/build/");
  for (const p of patterns) {
    if (p.skipBundle && isBundle) continue;
    for (const m of text.matchAll(p.re)) {
      const line = text.slice(0, m.index).split("\n").length;
      // A public value (e.g. a published test vector) can be marked on the line before it.
      const prev = text.split("\n")[line - 2] || "";
      if (prev.includes("secret-scan: public-value")) continue;
      fail(`${p.name}: ${file}:${line} (${m[0].slice(0, 6)}…redacted)`);
    }
  }
}
if (!failed) console.log(`✓ pattern scan: ${files.length} files clean`);

// --- 3. 64-hex values anywhere in git history --------------------------------
// gitleaks doesn't flag bare 32-byte hex (it could be a tx hash or a private key).
// A value a maintainer has reviewed and confirmed is NOT a secret can be allowlisted
// by its SHA-256 fingerprint (never the value itself) in .secret-scan-allowlist.
const allow = new Set(
  existsSync(".secret-scan-allowlist")
    ? readFileSync(".secret-scan-allowlist", "utf8").split("\n").map((l) => l.trim()).filter((l) => /^[0-9a-f]{64}$/.test(l))
    : []
);
const history = execFileSync("git", ["log", "-p", "--all", "--format=commit %H", "--", ".", ":!package-lock.json", ":!*.png", ":!*.gif"], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});
let commit = "";
const seen = new Set();
for (const line of history.split("\n")) {
  if (line.startsWith("commit ")) commit = line.slice(7, 14);
  if (!line.startsWith("+") || line.startsWith("+++")) continue;
  for (const m of line.matchAll(/(?<![0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g)) {
    const fp = createHash("sha256").update(m[1].toLowerCase()).digest("hex");
    if (allow.has(fp) || seen.has(fp)) continue;
    seen.add(fp);
    fail(`64-hex value in git history, commit ${commit} (${m[1].slice(0, 6)}…redacted, fingerprint ${fp.slice(0, 12)}). ` +
      "Confirm it isn't a private key, then allowlist its fingerprint.");
  }
}
if (seen.size === 0) console.log("✓ git history: no unreviewed 64-hex values");
process.exit(failed ? 1 : 0);
