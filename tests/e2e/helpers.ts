import type { Page } from "@playwright/test";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { hashPersonalMessage, publicKeyToAddress } from "../../src/web3/eth";

export interface MockWalletOptions {
  /** Inject as window.ethereum (legacy EIP-1193). */
  legacy?: boolean;
  /** Announce these wallets via EIP-6963. */
  announce?: { uuid: string; name: string }[];
  chainId?: string;
  rejectConnect?: boolean;
  rejectSwitch?: boolean;
  /** Sign with a different key than the connected account. */
  wrongSigner?: boolean;
}

/** A throwaway key per test run: generated in Node, never committed or reused. */
export function makeSigner() {
  const priv = secp256k1.utils.randomPrivateKey();
  const address = publicKeyToAddress(secp256k1.getPublicKey(priv, false));
  const signHex = (messageHex: string) => {
    const bytes = hexToBytes(messageHex.replace(/^0x/, ""));
    const sig = secp256k1.sign(hashPersonalMessage(bytes), priv);
    return `0x${bytesToHex(sig.toCompactRawBytes())}${(27 + sig.recovery).toString(16)}`;
  };
  return { address, signHex };
}

/**
 * Installs a mock EIP-1193 wallet that records every request in window.__walletLog
 * and every EIP-6963 discovery request in window.__discoveryRequests.
 */
export async function installMockWallet(page: Page, opts: MockWalletOptions = {}) {
  const good = makeSigner();
  const evil = makeSigner();
  await page.exposeFunction("__nodeSign", (messageHex: string) =>
    (opts.wrongSigner ? evil : good).signHex(messageHex)
  );
  await page.addInitScript(
    ({ opts, account }) => {
      const w = window as any;
      w.__walletLog = [];
      w.__discoveryRequests = 0;
      const state = { chainId: opts.chainId ?? "0xaa36a7" };
      const makeProvider = (name: string) => {
        const listeners: Record<string, Set<(v: unknown) => void>> = {};
        const emit = (ev: string, v: unknown) => listeners[ev]?.forEach((f) => f(v));
        return {
          isMock: true,
          on(ev: string, f: (v: unknown) => void) {
            (listeners[ev] ||= new Set()).add(f);
          },
          removeListener(ev: string, f: (v: unknown) => void) {
            listeners[ev]?.delete(f);
          },
          async request({ method, params }: { method: string; params?: unknown[] }) {
            w.__walletLog.push({ wallet: name, method, params: params ?? null });
            switch (method) {
              case "eth_requestAccounts":
                if (opts.rejectConnect) throw { code: 4001, message: "User rejected the request." };
                return [account.toLowerCase()];
              case "eth_accounts":
                return [account.toLowerCase()];
              case "eth_chainId":
                return state.chainId;
              case "wallet_switchEthereumChain":
                if (opts.rejectSwitch) throw { code: 4001, message: "User rejected the request." };
                state.chainId = (params as any)[0].chainId;
                setTimeout(() => emit("chainChanged", state.chainId), 0);
                return null;
              case "personal_sign":
                return w.__nodeSign((params as any)[0]);
              case "wallet_revokePermissions":
                return null;
              default:
                throw { code: 4200, message: `Unsupported method ${method}` };
            }
          },
        };
      };
      if (opts.legacy) w.ethereum = makeProvider("legacy");
      const announced = (opts.announce || []).map((info: any) => ({
        info: { ...info, icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", rdns: `test.${info.uuid}` },
        provider: makeProvider(info.name),
      }));
      window.addEventListener("eip6963:requestProvider", () => {
        w.__discoveryRequests++;
        for (const detail of announced) {
          window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze(detail) }));
        }
      });
    },
    { opts, account: good.address }
  );
  return { address: good.address };
}

export async function walletLog(page: Page): Promise<{ wallet: string; method: string; params: any }[]> {
  return page.evaluate(() => (window as any).__walletLog);
}

/** Plays with a simple autopilot until the score reaches `target`, then lets the bird crash. */
export async function scorePoints(page: Page, target = 1) {
  await page.getByRole("button", { name: "Start game" }).click();
  await page.evaluate(() => {
    (window as any).__ap = setInterval(() => {
      const bird = document.querySelector<HTMLElement>(".bird");
      if (!bird) return;
      const bt = parseFloat(bird.style.top);
      const bl = parseFloat(bird.style.left);
      const bs = parseFloat(bird.style.width);
      const next = [...document.querySelectorAll<HTMLElement>(".pipe.bottom")]
        .map((e) => ({ left: parseFloat(e.style.left), top: parseFloat(e.style.top), w: parseFloat(e.style.width) }))
        .filter((x) => x.left + x.w > bl - 4)
        .sort((a, b) => a.left - b.left)[0];
      const aim = next ? next.top - bs - 28 : 300;
      if (bt > aim && !document.querySelector(".overlay")) window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    }, 25);
  });
  await page.waitForFunction((t) => Number(document.querySelector(".score")?.textContent) >= t, target, { timeout: 40_000 });
  await page.evaluate(() => clearInterval((window as any).__ap));
  await page.getByRole("button", { name: "Play again" }).waitFor({ timeout: 20_000 });
}
