import { describe, expect, it, vi } from "vitest";
import { TARGET_CHAIN, ZDAPPY_CONTRACT_ADDRESS } from "../../src/web3/config";
import { hexToUtf8 } from "../../src/web3/eth";
import {
  describeError,
  discoverWallets,
  firstAccount,
  isTargetChain,
  parseChainId,
  personalSign,
  requestAccount,
  switchToTarget,
} from "../../src/web3/wallet";
import type { Eip1193Provider } from "../../src/web3/wallet";

const ADDR = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";

function fakeWindow(extra: Record<string, unknown> = {}) {
  const target = new EventTarget();
  return Object.assign(target, extra) as unknown as Window & { ethereum?: Eip1193Provider };
}

describe("wallet helpers", () => {
  it("targets a testnet only", () => {
    expect(TARGET_CHAIN.id).toBe(11155111);
    expect(TARGET_CHAIN.hexId).toBe("0xaa36a7");
    expect(ZDAPPY_CONTRACT_ADDRESS === null || /^0x[0-9a-fA-F]{40}$/.test(ZDAPPY_CONTRACT_ADDRESS)).toBe(true);
  });

  it("parses chain ids and accounts defensively", () => {
    expect(parseChainId("0xaa36a7")).toBe(11155111);
    expect(parseChainId(1)).toBe(1);
    expect(parseChainId("1")).toBe(1);
    expect(parseChainId(null)).toBeNull();
    expect(parseChainId({})).toBeNull();
    expect(firstAccount([ADDR])).toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    expect(firstAccount(["<script>"])).toBeNull();
    expect(firstAccount("nope")).toBeNull();
    expect(isTargetChain(11155111)).toBe(true);
    expect(isTargetChain(1)).toBe(false);
  });

  it("maps wallet errors to friendly copy", () => {
    expect(describeError({ code: 4001 })).toMatch(/rejected/i);
    expect(describeError({ code: -32002 })).toMatch(/waiting/i);
    expect(describeError(new Error("x".repeat(500))).length).toBeLessThan(200);
  });

  it("requests accounts only through eth_requestAccounts", async () => {
    const request = vi.fn().mockResolvedValue([ADDR]);
    await expect(requestAccount({ request })).resolves.toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    expect(request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
    await expect(requestAccount({ request: vi.fn().mockResolvedValue([]) })).rejects.toThrow();
  });

  it("switches to Sepolia, adding it when the wallet doesn't know it", async () => {
    const request = vi.fn().mockRejectedValueOnce({ code: 4902 }).mockResolvedValueOnce(null);
    await switchToTarget({ request });
    expect(request.mock.calls[0][0]).toEqual({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
    expect(request.mock.calls[1][0].method).toBe("wallet_addEthereumChain");
    expect(request.mock.calls[1][0].params[0].chainId).toBe("0xaa36a7");
  });

  it("propagates a rejected network switch", async () => {
    const request = vi.fn().mockRejectedValue({ code: 4001 });
    await expect(switchToTarget({ request })).rejects.toEqual({ code: 4001 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("asks the wallet to sign exactly the given text and nothing else", async () => {
    const sig = `0x${"11".repeat(65)}`;
    const request = vi.fn().mockResolvedValue(sig);
    const text = "Zdappy Bird score\n\nScore: 9";
    await expect(personalSign({ request }, text, ADDR)).resolves.toBe(sig);
    const call = request.mock.calls[0][0];
    expect(call.method).toBe("personal_sign");
    expect(call.params).toHaveLength(2);
    expect(hexToUtf8(call.params[0])).toBe(text);
    expect(call.params[1]).toBe(ADDR);
    await expect(personalSign({ request: vi.fn().mockResolvedValue("0xdead") }, text, ADDR)).rejects.toThrow();
  });

  it("discovers EIP-6963 wallets and the legacy injected provider", async () => {
    const legacy = { request: vi.fn() };
    const win = fakeWindow({ ethereum: legacy });
    const announced = { request: vi.fn() };
    win.addEventListener("eip6963:requestProvider", () => {
      win.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: { info: { uuid: "a", name: "Mock Wallet", icon: "javascript:alert(1)" }, provider: announced },
        })
      );
      win.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "bad" }, provider: {} } }));
    });
    const list = await discoverWallets(win, 10);
    expect(list.map((w) => w.name)).toEqual(["Mock Wallet", "Browser wallet"]);
    expect(list[0].icon).toBeUndefined(); // non-image icon URLs are dropped
    expect(legacy.request).not.toHaveBeenCalled();
    expect(announced.request).not.toHaveBeenCalled();
  });

  it("finds nothing when no wallet is installed", async () => {
    await expect(discoverWallets(fakeWindow(), 10)).resolves.toEqual([]);
  });
});
