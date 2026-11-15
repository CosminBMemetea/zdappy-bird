// Opt-in EIP-1193 wallet access with EIP-6963 discovery. Nothing here runs until the
// player clicks "Connect wallet": no requests, no prompts, no storage.
import { TARGET_CHAIN } from "./config";
import { isAddress, toChecksumAddress, utf8ToHex } from "./eth";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
}

export interface WalletInfo {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
}

interface AnnounceDetail {
  info: { uuid: string; name: string; icon?: string; rdns?: string };
  provider: Eip1193Provider;
}

/** Ask installed wallets to announce themselves (EIP-6963), falling back to window.ethereum. */
export function discoverWallets(win: Window & { ethereum?: Eip1193Provider } = window, waitMs = 200): Promise<WalletInfo[]> {
  return new Promise((resolve) => {
    const found = new Map<string, WalletInfo>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<AnnounceDetail>).detail;
      if (!detail?.provider || typeof detail.provider.request !== "function" || !detail.info?.uuid) return;
      const icon = typeof detail.info.icon === "string" && /^data:image\/(svg\+xml|png|webp|jpeg|gif);/.test(detail.info.icon) ? detail.info.icon : undefined;
      found.set(detail.info.uuid, { id: detail.info.uuid, name: String(detail.info.name || "Wallet").slice(0, 40), icon, provider: detail.provider });
    };
    win.addEventListener("eip6963:announceProvider", onAnnounce);
    win.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      win.removeEventListener("eip6963:announceProvider", onAnnounce);
      const list = [...found.values()];
      const legacy = win.ethereum;
      if (legacy && typeof legacy.request === "function" && !list.some((w) => w.provider === legacy)) {
        list.push({ id: "injected", name: "Browser wallet", provider: legacy });
      }
      resolve(list);
    }, waitMs);
  });
}

export function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string") {
    const n = value.startsWith("0x") ? parseInt(value, 16) : parseInt(value, 10);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

export function firstAccount(value: unknown): string | null {
  if (!Array.isArray(value) || !isAddress(value[0])) return null;
  return toChecksumAddress(value[0]);
}

export const isTargetChain = (chainId: number | null) => chainId === TARGET_CHAIN.id;

export async function requestAccount(provider: Eip1193Provider): Promise<string> {
  const account = firstAccount(await provider.request({ method: "eth_requestAccounts" }));
  if (!account) throw new Error("The wallet did not return an account.");
  return account;
}

export async function readChainId(provider: Eip1193Provider): Promise<number | null> {
  return parseChainId(await provider.request({ method: "eth_chainId" }));
}

export async function switchToTarget(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: TARGET_CHAIN.hexId }] });
  } catch (err) {
    if ((err as { code?: number })?.code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: TARGET_CHAIN.hexId,
          chainName: TARGET_CHAIN.name,
          rpcUrls: [...TARGET_CHAIN.rpcUrls],
          blockExplorerUrls: [TARGET_CHAIN.explorer],
          nativeCurrency: TARGET_CHAIN.nativeCurrency,
        },
      ],
    });
  }
}

export async function personalSign(provider: Eip1193Provider, message: string, address: string): Promise<string> {
  const sig = await provider.request({ method: "personal_sign", params: [utf8ToHex(message), address] });
  if (typeof sig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new Error("The wallet returned an invalid signature.");
  return sig;
}

/** Turn wallet errors into short, friendly copy. */
export function describeError(err: unknown): string {
  const code = (err as { code?: number })?.code;
  if (code === 4001) return "Request rejected in your wallet. No problem, the game works without it.";
  if (code === -32002) return "Your wallet already has a request waiting. Open it to continue.";
  if (code === 4100) return "Your wallet hasn't authorized this site yet.";
  if (code === 4902) return "Your wallet doesn't know the Sepolia network.";
  const msg = (err as { message?: string })?.message;
  return msg ? `Wallet error: ${String(msg).slice(0, 120)}` : "Something went wrong with the wallet.";
}
