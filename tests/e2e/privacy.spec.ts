import { expect, test } from "@playwright/test";
import { installMockWallet, scorePoints } from "./helpers";

test("stores nothing on the device and only contacts its own origin", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requested = new Set<string>();
  page.on("request", (r) => {
    if (!r.url().startsWith("data:")) requested.add(new URL(r.url()).origin);
  });
  const { address } = await installMockWallet(page, { legacy: true });
  await page.goto("/");
  await scorePoints(page, 1);
  await page.getByTestId("connect").click();
  await page.getByTestId("prepare").click();
  await page.getByTestId("sign").click();
  await expect(page.getByTestId("result")).toContainText("Signature verified");

  const storage = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    cookie: document.cookie,
    idb: (await indexedDB.databases()).map((d) => d.name),
    caches: await caches.keys(),
  }));
  expect(storage).toEqual({ local: [], session: [], cookie: "", idb: [], caches: [] });
  expect(await context.cookies()).toEqual([]);
  const dump = JSON.stringify(await context.storageState());
  expect(dump.toLowerCase()).not.toContain(address.slice(2).toLowerCase());

  expect([...requested]).toEqual([origin]);
});

test("ships a Content-Security-Policy that blocks inline scripts and outside connections", async ({ page }) => {
  const outside: string[] = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    outside.push(route.request().url());
    return route.abort();
  });
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toBeTruthy();
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]) {
    expect(csp).toContain(directive);
  }
  expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|\*/);

  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (e) => violations.push(e.effectiveDirective));
    const s = document.createElement("script");
    s.textContent = "window.__inlineRan = true";
    document.body.appendChild(s);
    let fetchBlocked = false;
    try {
      await fetch("https://example.com/collect");
    } catch {
      fetchBlocked = true;
    }
    const img = new Image();
    const imgBlocked = await new Promise((res) => {
      img.onload = () => res(false);
      img.onerror = () => res(true);
      img.src = "https://example.com/pixel.png";
    });
    await new Promise((r) => setTimeout(r, 100));
    return { inlineRan: (window as any).__inlineRan === true, fetchBlocked, imgBlocked, violations };
  });
  expect(result.inlineRan).toBe(false);
  expect(result.fetchBlocked).toBe(true);
  expect(result.imgBlocked).toBe(true);
  expect(result.violations).toEqual(expect.arrayContaining(["script-src-elem", "connect-src", "img-src"]));
  // Blocked by CSP before reaching the network.
  expect(outside).toEqual([]);
});
