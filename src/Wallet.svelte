<script lang="ts">
  import { onDestroy } from "svelte";
  import { TARGET_CHAIN, ZDAPPY_CONTRACT_ADDRESS, chainName } from "./web3/config";
  import { shortAddress, verifyPersonalSignature } from "./web3/eth";
  import { buildScoreMessage } from "./web3/message";
  import {
    describeError,
    discoverWallets,
    firstAccount,
    isTargetChain,
    parseChainId,
    personalSign,
    readChainId,
    requestAccount,
    switchToTarget,
  } from "./web3/wallet";
  import type { Eip1193Provider, WalletInfo } from "./web3/wallet";

  /** Best score of this session (kept in memory by the game). */
  export let score = 0;

  // All state lives in memory only. Nothing is written to storage or sent to a server.
  let status: "idle" | "discovering" | "picking" | "connecting" | "connected" = "idle";
  let wallets: WalletInfo[] = [];
  let provider: Eip1193Provider | null = null;
  let walletName = "";
  let address: string | null = null;
  let chainId: number | null = null;
  let error = "";
  let noWallet = false;
  let busy = false;
  let pendingMessage: string | null = null;
  let signature: string | null = null;
  let verified: boolean | null = null;
  let copied = false;

  $: onTarget = isTargetChain(chainId);

  function resetSignature() {
    pendingMessage = null;
    signature = null;
    verified = null;
    copied = false;
  }

  const onAccounts = (accounts: unknown) => {
    const next = firstAccount(accounts);
    if (!next) return disconnect();
    if (next !== address) resetSignature();
    address = next;
  };
  const onChain = (id: unknown) => {
    chainId = parseChainId(id);
    resetSignature();
  };
  const onDisconnect = () => disconnect();

  function listen(p: Eip1193Provider) {
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    p.on?.("disconnect", onDisconnect);
  }
  function unlisten(p: Eip1193Provider) {
    p.removeListener?.("accountsChanged", onAccounts);
    p.removeListener?.("chainChanged", onChain);
    p.removeListener?.("disconnect", onDisconnect);
  }

  async function startConnect() {
    error = "";
    noWallet = false;
    status = "discovering";
    wallets = await discoverWallets();
    if (wallets.length === 0) {
      noWallet = true;
      status = "idle";
    } else if (wallets.length === 1) {
      await connect(wallets[0]);
    } else {
      status = "picking";
    }
  }

  async function connect(w: WalletInfo) {
    status = "connecting";
    error = "";
    try {
      const account = await requestAccount(w.provider);
      const id = await readChainId(w.provider);
      provider = w.provider;
      walletName = w.name;
      address = account;
      chainId = id;
      listen(w.provider);
      status = "connected";
    } catch (err) {
      error = describeError(err);
      status = "idle";
    }
  }

  async function disconnect() {
    const p = provider;
    if (p) {
      unlisten(p);
      // Ask the wallet to drop this site's permission if it supports it; ignore if not.
      p.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {});
    }
    provider = null;
    address = null;
    chainId = null;
    walletName = "";
    status = "idle";
    error = "";
    resetSignature();
  }

  async function switchNetwork() {
    if (!provider) return;
    busy = true;
    error = "";
    try {
      await switchToTarget(provider);
      chainId = await readChainId(provider);
    } catch (err) {
      error = describeError(err);
    } finally {
      busy = false;
    }
  }

  function prepare() {
    if (!address || chainId === null) return;
    resetSignature();
    pendingMessage = buildScoreMessage({ score, address, chainId, issuedAt: new Date() });
  }

  async function sign() {
    if (!provider || !address || !pendingMessage || !onTarget) return;
    busy = true;
    error = "";
    try {
      const sig = await personalSign(provider, pendingMessage, address);
      signature = sig;
      verified = verifyPersonalSignature(pendingMessage, sig, address);
    } catch (err) {
      error = describeError(err);
    } finally {
      busy = false;
    }
  }

  async function copySignature() {
    if (!signature) return;
    try {
      await navigator.clipboard.writeText(signature);
      copied = true;
    } catch {
      copied = false;
    }
  }

  onDestroy(() => provider && unlisten(provider));
</script>

<aside class="panel wallet" aria-label="Wallet (optional)">
  <div class="head">
    <h2>Wallet</h2>
    <span class="chip">Optional · {TARGET_CHAIN.name} testnet</span>
  </div>

  {#if status !== "connected"}
    <p class="muted">
      Connect a browser wallet to sign your best score. It's free, sends no transaction, and you can play without it.
    </p>

    {#if status === "picking"}
      <ul class="list" data-testid="wallet-list">
        {#each wallets as w (w.id)}
          <li>
            <button class="wallet-btn" on:click={() => connect(w)}>
              {#if w.icon}<img src={w.icon} alt="" width="20" height="20" />{/if}
              <span>{w.name}</span>
            </button>
          </li>
        {/each}
      </ul>
      <button class="link" on:click={() => (status = "idle")}>Cancel</button>
    {:else}
      <button class="btn-outline" on:click={startConnect} disabled={status !== "idle"} data-testid="connect">
        {status === "discovering" ? "Looking for wallets…" : status === "connecting" ? "Check your wallet…" : "Connect wallet"}
      </button>
    {/if}

    {#if noWallet}
      <p class="note" data-testid="no-wallet">
        No browser wallet found. On a phone, open this page in your wallet app's browser (for example MetaMask). On a
        computer, install a wallet extension. The game works fine without one.
      </p>
    {/if}
  {:else if address}
    <div class="account" data-testid="account">
      <span class="dot" class:ok={onTarget} aria-hidden="true"></span>
      <div class="who">
        <strong class="mono" title={address}>{shortAddress(address)}</strong>
        <span class="net" data-testid="network">{chainName(chainId)}{walletName ? ` · ${walletName}` : ""}</span>
      </div>
      <button class="link" on:click={disconnect} data-testid="disconnect">Disconnect</button>
    </div>

    {#if !onTarget}
      <div class="warn" data-testid="wrong-network">
        <p>This demo only works on the {TARGET_CHAIN.name} testnet.</p>
        <button class="btn-outline" on:click={switchNetwork} disabled={busy}>Switch to {TARGET_CHAIN.name}</button>
      </div>
    {:else}
      <div class="sign">
        <h3>Sign your best score</h3>
        {#if score <= 0}
          <p class="muted">Score at least one point first. Your best this session: {score}.</p>
        {:else if !pendingMessage}
          <p class="muted">Best this session: <strong>{score}</strong>. You'll see the exact message before signing.</p>
          <button class="btn-outline" on:click={prepare} data-testid="prepare">Review message</button>
        {:else}
          <p class="muted">Your wallet will be asked to sign exactly this text:</p>
          <pre class="msg" data-testid="message">{pendingMessage}</pre>
          {#if !signature}
            <div class="row">
              <button class="btn-outline" on:click={sign} disabled={busy} data-testid="sign">{busy ? "Check your wallet…" : "Sign in wallet"}</button>
              <button class="link" on:click={resetSignature}>Cancel</button>
            </div>
          {:else}
            <div class="result" class:bad={!verified} data-testid="result">
              {#if verified}
                <strong>✓ Signature verified</strong>
                <span>Checked in your browser: it was signed by {shortAddress(address)}.</span>
              {:else}
                <strong>✗ Signature does not match</strong>
                <span>The wallet's signature doesn't belong to {shortAddress(address)}.</span>
              {/if}
              <code class="mono sig" title={signature}>{signature.slice(0, 18)}…{signature.slice(-8)}</code>
              <div class="row">
                <button class="link" on:click={copySignature}>{copied ? "Copied" : "Copy signature"}</button>
                <button class="link" on:click={prepare}>Sign again</button>
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <p class="fine">
        {#if ZDAPPY_CONTRACT_ADDRESS}
          Contract: <span class="mono">{shortAddress(ZDAPPY_CONTRACT_ADDRESS)}</span>
        {:else}
          On-chain minting arrives once the Zdappy contract is deployed to {TARGET_CHAIN.name}.
        {/if}
      </p>
    {/if}
  {/if}

  {#if error}
    <p class="error" role="alert" data-testid="error">{error}</p>
  {/if}
</aside>

<style>
  .wallet {
    display: grid;
    gap: 12px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .head h2 {
    margin: 0;
  }
  .chip {
    font-size: 0.7rem;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(0, 255, 65, 0.35);
    color: var(--neon);
    white-space: nowrap;
  }
  .muted,
  .note,
  .fine {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .muted strong {
    color: var(--text);
  }
  .note {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px dashed var(--line);
  }
  .fine {
    font-size: 0.75rem;
  }
  .btn-outline {
    width: 100%;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid rgba(0, 255, 65, 0.55);
    background: rgba(0, 255, 65, 0.08);
    color: var(--text);
    font: 700 0.9rem var(--sans);
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  }
  .btn-outline:hover:not(:disabled) {
    background: rgba(0, 255, 65, 0.16);
    box-shadow: 0 0 18px rgba(0, 255, 65, 0.2);
  }
  .btn-outline:focus-visible,
  .link:focus-visible,
  .wallet-btn:focus-visible {
    outline: 2px solid var(--neon);
    outline-offset: 2px;
  }
  .btn-outline:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  .link {
    background: none;
    border: 0;
    padding: 4px 0;
    color: var(--neon);
    font: 600 0.85rem var(--sans);
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
  .list {
    display: grid;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .wallet-btn {
    width: 100%;
  }
  .wallet-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: #0d1511;
    color: var(--text);
    font: 600 0.9rem var(--sans);
    cursor: pointer;
  }
  .wallet-btn:hover {
    border-color: rgba(0, 255, 65, 0.5);
  }
  .account {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--line);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ffb020;
    box-shadow: 0 0 10px #ffb020;
    flex: none;
  }
  .dot.ok {
    background: var(--neon);
    box-shadow: 0 0 10px var(--neon);
  }
  .who {
    display: grid;
    flex: 1 1 110px;
    min-width: 0;
  }
  .who strong {
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .net {
    font-size: 0.75rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .warn {
    display: grid;
    gap: 8px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid rgba(255, 176, 32, 0.45);
    background: rgba(255, 176, 32, 0.08);
  }
  .warn p {
    margin: 0;
    font-size: 0.85rem;
  }
  .sign {
    display: grid;
    gap: 10px;
  }
  .sign h3 {
    margin: 0;
    font-size: 0.9rem;
  }
  .msg {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: #050b07;
    border: 1px solid var(--line);
    color: #cfe9d7;
    font: 0.72rem/1.5 var(--mono);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 220px;
    overflow: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .row .btn-outline {
    width: auto;
    flex: 1;
  }
  .result {
    display: grid;
    gap: 6px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid rgba(0, 255, 65, 0.45);
    background: rgba(0, 255, 65, 0.07);
    font-size: 0.85rem;
  }
  .result strong {
    color: var(--neon);
  }
  .result.bad {
    border-color: rgba(255, 80, 80, 0.5);
    background: rgba(255, 80, 80, 0.08);
  }
  .result.bad strong {
    color: #ff6b6b;
  }
  .result span {
    color: var(--muted);
  }
  .sig {
    font-size: 0.75rem;
    color: var(--text);
  }
  .error {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 80, 80, 0.1);
    border: 1px solid rgba(255, 80, 80, 0.4);
    color: #ffb4b4;
    font-size: 0.85rem;
  }
  .mono {
    font-family: var(--mono);
  }
</style>
