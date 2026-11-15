# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private
[**Report a vulnerability**](../../security/advisories/new) form on this repository instead.
I'll acknowledge reports as soon as I can and keep you updated on the fix.

## Scope and data handling

- This project is a static, client-side web app. It has no backend, accounts, or database.
- It does not collect, store, or transmit personal data: no cookies, `localStorage`, analytics, or trackers.
- Any smart contract code in this repository is experimental and unaudited. Only deploy it to test networks.
- Never commit secrets (private keys, mnemonics, API keys, `.env` files). They are git-ignored, and the history has been scanned with gitleaks.
