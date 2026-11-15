import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "fs";

// Use a system Chrome when one is available (or CHROME_PATH is set); otherwise Playwright's own Chromium.
const executablePath =
  process.env.CHROME_PATH || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
const PORT = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath },
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } }, grepInvert: /@touch/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile|@touch/ },
  ],
  webServer: {
    command: `npx sirv public --host 127.0.0.1 --port ${PORT} --quiet`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
