import { expect, test, type CDPSession, type Page } from "@playwright/test";

// Runs only in the "mobile" project (Pixel 7 emulation: touch, isMobile).
// Touches are sent with CDP Input.dispatchTouchEvent, which goes through Chrome's real
// gesture pipeline: a one-finger drag really scrolls the page unless touch-action /
// preventDefault stop it. Headless Chrome doesn't emulate pinch- or double-tap-zoom, so
// those are checked through what makes real browsers skip them: touch-action: none on
// the board and cancelled touch events, plus visualViewport.scale staying at 1.

type Pt = { x: number; y: number; id?: number };
const send = (s: CDPSession, type: string, touchPoints: Pt[]) => s.send("Input.dispatchTouchEvent", { type, touchPoints } as any);

async function drag(page: Page, s: CDPSession, x: number, y0: number, y1: number) {
  await send(s, "touchStart", [{ x, y: y0 }]);
  for (let i = 1; i <= 10; i++) {
    await send(s, "touchMove", [{ x, y: y0 + ((y1 - y0) * i) / 10 }]);
    await page.waitForTimeout(16);
  }
  await send(s, "touchEnd", []);
  await page.waitForTimeout(250);
}
async function pinch(page: Page, s: CDPSession, x: number, y: number) {
  await send(s, "touchStart", [{ x: x - 20, y, id: 1 }, { x: x + 20, y, id: 2 }]);
  for (let i = 1; i <= 10; i++) {
    const d = 20 + i * 10;
    await send(s, "touchMove", [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }]);
    await page.waitForTimeout(16);
  }
  await send(s, "touchEnd", []);
  await page.waitForTimeout(250);
}
async function boardPoint(page: Page, fy = 0.8) {
  const box = (await page.getByTestId("board").boundingBox())!;
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height * fy) };
}
const viewport = (page: Page) => page.evaluate(() => ({ scale: window.visualViewport!.scale, scrollY: window.scrollY }));
const birdTop = (page: Page) => page.evaluate(() => parseFloat(document.querySelector<HTMLElement>(".bird")!.style.top));

/** Records whether touch events that reached the board were cancelled (window sees them after the board). */
async function watchTouches(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__touches = { start: 0, startCancelled: 0, move: 0, moveCancelled: 0 };
    const onBoard = (e: Event) => e.target instanceof Element && !!e.target.closest('[data-testid="board"]');
    window.addEventListener("touchstart", (e) => {
      if (!onBoard(e)) return;
      w.__touches.start++;
      if (e.defaultPrevented) w.__touches.startCancelled++;
    });
    window.addEventListener("touchmove", (e) => {
      if (!onBoard(e)) return;
      w.__touches.move++;
      if (e.defaultPrevented) w.__touches.moveCancelled++;
    });
  });
}
const touches = (page: Page) => page.evaluate(() => (window as any).__touches);

async function startByTap(page: Page) {
  await page.getByRole("button", { name: "Start game" }).tap();
  await expect(page.locator(".score")).toBeVisible();
}

test.describe("mobile play @touch", () => {
  test("board blocks browser gestures; page zoom isn't disabled globally", async ({ page }) => {
    await page.goto("/");
    const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(meta).toContain("viewport-fit=cover");
    expect(meta).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/);
    const css = await page.evaluate(() => {
      const board = getComputedStyle(document.querySelector('[data-testid="board"]')!);
      const button = getComputedStyle(document.querySelector('[data-testid="board"] button')!);
      const panel = getComputedStyle(document.querySelector('aside[aria-label="Character"]')!);
      return {
        board: board.touchAction,
        boardButton: button.touchAction,
        boardSelect: board.userSelect || (board as any).webkitUserSelect,
        boardOverscroll: board.overscrollBehaviorY,
        rootOverscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
        panel: panel.touchAction,
      };
    });
    expect(css).toEqual({
      board: "none",
      boardButton: "auto", // effective touch-action is still none: it intersects with the board's
      boardSelect: "none",
      boardOverscroll: "contain",
      rootOverscroll: "none",
      panel: "auto", // outside the board, pinch-zoom and scrolling stay available
    });
  });

  test("taps on the board register as flaps", async ({ page }) => {
    await page.goto("/");
    await startByTap(page);
    const { x, y } = await boardPoint(page);
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(250); // let gravity pull the bird down
      const before = await birdTop(page);
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(60);
      expect(await birdTop(page)).toBeLessThan(before);
    }
    await expect(page.locator(".overlay")).toHaveCount(0); // still flying
  });

  test("double-tap, pinch, and swipes on the board don't zoom or scroll", async ({ page }) => {
    await page.goto("/");
    await watchTouches(page);
    const s = await page.context().newCDPSession(page);

    // Before a run, a swipe that starts on the Start button doesn't scroll the page either.
    const btn = (await page.getByRole("button", { name: "Start game" }).boundingBox())!;
    const bx = Math.round(btn.x + btn.width / 2);
    const by = Math.round(btn.y + btn.height / 2);
    await drag(page, s, bx, by, by - 300);
    await drag(page, s, bx, by, by + 300); // pull-to-refresh direction
    expect(await viewport(page)).toEqual({ scale: 1, scrollY: 0 });

    if (await page.locator(".overlay").count()) await page.locator(".overlay button").tap();
    await expect(page.locator(".score")).toBeVisible();
    const { x, y } = await boardPoint(page);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(x, y);
    await pinch(page, s, x, y);
    await drag(page, s, x, y, y - 300);
    expect(await viewport(page)).toEqual({ scale: 1, scrollY: 0 });

    const t = await touches(page);
    expect(t.move).toBeGreaterThan(0);
    expect(t.moveCancelled).toBe(t.move);
    // Every touchstart on the board itself is cancelled (no double-tap zoom, callout, or emulated mouse);
    // only touches on overlay buttons (here at most 3) are let through so they can click.
    expect(t.startCancelled).toBeGreaterThanOrEqual(t.start - 3);
    expect(t.startCancelled).toBeGreaterThanOrEqual(4);
  });

  test("page scroll stays at 0 during a run, even when swiping outside the board", async ({ page }) => {
    await page.goto("/");
    const s = await page.context().newCDPSession(page);
    const vp = page.viewportSize()!;
    expect((await viewport(page)).scrollY).toBe(0);
    await startByTap(page);
    const samples: number[] = [];
    while ((await page.locator(".overlay").count()) === 0 && samples.length < 12) {
      await drag(page, s, Math.round(vp.width / 2), vp.height - 30, vp.height - 330);
      samples.push((await viewport(page)).scrollY);
    }
    expect(samples.length).toBeGreaterThan(0);
    expect(samples).toEqual(samples.map(() => 0));

    // Control: after the run, the same swipe scrolls the page again.
    await expect(page.locator(".overlay")).toBeVisible({ timeout: 15_000 });
    await drag(page, s, Math.round(vp.width / 2), vp.height - 30, vp.height - 330);
    expect((await viewport(page)).scrollY).toBeGreaterThan(0);
  });

  test("long-press shows no callout or text selection on the board", async ({ page }) => {
    await page.goto("/");
    const prevented = await page.getByTestId("board").evaluate((el) => {
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(true);
    const s = await page.context().newCDPSession(page);
    const { x, y } = await boardPoint(page, 0.15);
    await send(s, "touchStart", [{ x, y }]);
    await page.waitForTimeout(900);
    await send(s, "touchEnd", []);
    expect(await page.evaluate(() => String(window.getSelection()))).toBe("");
  });

  test("refits the board on rotation and stays playable", async ({ page }) => {
    await page.goto("/");
    const portrait = (await page.getByTestId("board").boundingBox())!;
    expect(portrait.y + portrait.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.setViewportSize({ width: 915, height: 412 });
    await expect.poll(async () => (await page.getByTestId("board").boundingBox())!.height).not.toBe(portrait.height);
    const landscape = (await page.getByTestId("board").boundingBox())!;
    expect(landscape.width).toBeLessThanOrEqual(915);
    expect(landscape.height).toBeGreaterThanOrEqual(280);
    expect(landscape.y + landscape.height).toBeLessThanOrEqual(412); // the whole board fits on screen
    await startByTap(page);
    const { x, y } = await boardPoint(page);
    await page.waitForTimeout(200);
    const before = await birdTop(page);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(60);
    expect(await birdTop(page)).toBeLessThan(before);

    // Rotating mid-run waits for the run to end before resizing.
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(400);
    expect((await page.getByTestId("board").boundingBox())!.height).toBe(landscape.height);
    await expect(page.locator(".overlay")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await page.getByTestId("board").boundingBox())!.height).not.toBe(landscape.height);
  });
});
