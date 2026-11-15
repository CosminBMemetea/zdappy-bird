# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private
[**Report a vulnerability**](../../security/advisories/new) form on this repository instead.
I'll acknowledge reports as soon as I can and keep you updated on the fix.

## Scope and data handling

- This project is a static, client-side web app. It has no backend, accounts, or database.
- It does not collect, store, or transmit personal data: no cookies, `localStorage`, analytics, or trackers.
- The wallet feature is optional and Sepolia-only. It never prompts on its own, sends no transactions, and keeps the address and any signature in memory only. A Content-Security-Policy meta tag blocks inline scripts and any request to another origin.
- Any smart contract code in this repository is experimental and unaudited. Only deploy it to test networks.
- Never commit secrets (private keys, mnemonics, API keys, `.env` files). They are git-ignored.

## Security tests

Run everything with:

```bash
npm run test:security
```

It builds the site, then runs:

| Step | Command | Checks |
| --- | --- | --- |
| Unit tests | `npm run test:unit` | Exact signed-message format, EIP-191 hashing, signature recovery, tampered and malformed signatures, wallet request parameters |
| Browser tests | `npm run test:e2e` | No wallet prompt before **Connect**; connect/disconnect, rejection, and wrong-network handling with a mocked wallet; the wallet signs exactly the text shown; no cookies or web storage; same-origin requests only; CSP enforced; stable mobile touch handling |
| Secret scan | `npm run scan:secrets` | gitleaks over git history, `src/`, and the built bundle; 64-hex keys, seed phrases, RPC/API keys in tracked files; unreviewed 64-hex values anywhere in history |
| Dependency audit | `npm run audit:prod` | `npm audit --omit=dev --audit-level=high` |

A 64-hex value in git history might be a public transaction hash or a private key, so the scan fails until a maintainer reviews it. If it is **not** a secret, add its SHA-256 fingerprint (never the value) to `.secret-scan-allowlist`. If it **is** a key, treat it as compromised: move any funds, stop using it, and rewrite the history.

A CI workflow that runs these on every push and pull request is kept as a draft, because the deploy token can't push workflow files.
