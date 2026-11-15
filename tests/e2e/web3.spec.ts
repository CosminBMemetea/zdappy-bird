import { expect, test } from "@playwright/test";
import { hexToUtf8 } from "../../src/web3/eth";
import { installMockWallet, scorePoints, walletLog } from "./helpers";

const SEPOLIA = "0xaa36a7";

test.describe("game without a wallet", () => {
  test("plays fully with no provider and shows a helpful message on connect @mobile", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await scorePoints(page, 1);
    await expect(page.getByText("Game over", { exact: false }).first()).toBeVisible();
    await page.getByTestId("connect").click();
    await expect(page.getByTestId("no-wallet")).toBeVisible();
    await expect(page.getByTestId("no-wallet")).toContainText("The game works fine without one");
    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.locator(".score")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("never talks to an installed wallet until Connect is clicked", async ({ page }) => {
    await installMockWallet(page, { legacy: true, announce: [{ uuid: "a", name: "Mock A" }] });
    await page.goto("/");
    await scorePoints(page, 1);
    await page.getByRole("button", { name: "Play again" }).click();
    await page.keyboard.press("Space");
    await page.waitForTimeout(500);
    expect(await walletLog(page)).toEqual([]);
    expect(await page.evaluate(() => (window as any).__discoveryRequests)).toBe(0);
  });
});

test.describe("wallet connection (mocked EIP-1193)", () => {
  test("connects and disconnects", async ({ page }) => {
    const { address } = await installMockWallet(page, { legacy: true });
    await page.goto("/");
    await page.getByTestId("connect").click();
    const account = page.getByTestId("account");
    await expect(account).toContainText(`${address.slice(0, 6)}…${address.slice(-4)}`);
    await expect(page.getByTestId("network")).toContainText("Sepolia");
    await expect(page.getByTestId("wrong-network")).toHaveCount(0);
    expect((await walletLog(page)).map((r) => r.method)).toEqual(["eth_requestAccounts", "eth_chainId"]);

    await page.getByTestId("disconnect").click();
    await expect(page.getByTestId("connect")).toBeVisible();
    await expect(account).toHaveCount(0);
    expect((await walletLog(page)).map((r) => r.method)).toContain("wallet_revokePermissions");
  });

  test("handles the user rejecting the connection", async ({ page }) => {
    await installMockWallet(page, { legacy: true, rejectConnect: true });
    await page.goto("/");
    await page.getByTestId("connect").click();
    await expect(page.getByTestId("error")).toContainText(/rejected/i);
    await expect(page.getByTestId("connect")).toBeEnabled();
    await expect(page.getByTestId("account")).toHaveCount(0);
    // The game is unaffected.
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.locator(".score")).toBeVisible();
  });

  test("lets the user pick between EIP-6963 wallets", async ({ page }) => {
    await installMockWallet(page, {
      announce: [
        { uuid: "a", name: "Mock A" },
        { uuid: "b", name: "Mock B" },
      ],
    });
    await page.goto("/");
    await page.getByTestId("connect").click();
    const list = page.getByTestId("wallet-list");
    await expect(list.getByRole("button")).toHaveText(["Mock A", "Mock B"]);
    await list.getByRole("button", { name: "Mock B" }).click();
    await expect(page.getByTestId("network")).toContainText("Mock B");
    const log = await walletLog(page);
    expect(log.every((r) => r.wallet === "Mock B")).toBe(true);
  });

  test("guards against the wrong network and offers a switch", async ({ page }) => {
    await installMockWallet(page, { legacy: true, chainId: "0x1" });
    await page.goto("/");
    await scorePoints(page, 1);
    await page.getByTestId("connect").click();
    await expect(page.getByTestId("wrong-network")).toBeVisible();
    await expect(page.getByTestId("network")).toContainText("Ethereum");
    await expect(page.getByTestId("prepare")).toHaveCount(0);

    await page.getByRole("button", { name: "Switch to Sepolia" }).click();
    await expect(page.getByTestId("wrong-network")).toHaveCount(0);
    await expect(page.getByTestId("network")).toContainText("Sepolia");
    await expect(page.getByTestId("prepare")).toBeVisible();
    const switchCall = (await walletLog(page)).find((r) => r.method === "wallet_switchEthereumChain");
    expect(switchCall?.params).toEqual([{ chainId: SEPOLIA }]);
  });

  test("handles a rejected network switch", async ({ page }) => {
    await installMockWallet(page, { legacy: true, chainId: "0x1", rejectSwitch: true });
    await page.goto("/");
    await page.getByTestId("connect").click();
    await page.getByRole("button", { name: "Switch to Sepolia" }).click();
    await expect(page.getByTestId("error")).toContainText(/rejected/i);
    await expect(page.getByTestId("wrong-network")).toBeVisible();
  });
});

test.describe("sign your score", () => {
  test("the wallet signs exactly the text shown, and the signature verifies", async ({ page }) => {
    const { address } = await installMockWallet(page, { legacy: true });
    await page.goto("/");
    await scorePoints(page, 1);
    await page.getByTestId("connect").click();
    await page.getByTestId("prepare").click();
    const shown = await page.getByTestId("message").textContent();
    expect(shown).toContain(`Player: ${address}`);
    expect(shown).toMatch(/^Zdappy Bird score\n\nScore: \d+\n/);
    await page.getByTestId("sign").click();
    await expect(page.getByTestId("result")).toContainText("Signature verified");

    const calls = (await walletLog(page)).filter((r) => r.method === "personal_sign");
    expect(calls).toHaveLength(1);
    const [hexMessage, signer, ...rest] = calls[0].params;
    expect(rest).toEqual([]);
    expect(signer.toLowerCase()).toBe(address.toLowerCase());
    expect(hexToUtf8(hexMessage)).toBe(shown);
    // No eth_sendTransaction or other state-changing calls.
    expect((await walletLog(page)).map((r) => r.method).sort()).toEqual(
      ["eth_chainId", "eth_requestAccounts", "personal_sign"].sort()
    );
  });

  test("flags a signature from a different key", async ({ page }) => {
    await installMockWallet(page, { legacy: true, wrongSigner: true });
    await page.goto("/");
    await scorePoints(page, 1);
    await page.getByTestId("connect").click();
    await page.getByTestId("prepare").click();
    await page.getByTestId("sign").click();
    await expect(page.getByTestId("result")).toContainText("Signature does not match");
  });
});
