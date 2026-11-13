import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  // Playwright empties outputDir before each run. Screenshots go to test-results/shots,
  // a sibling folder, so they survive.
  outputDir: "./test-results/artifacts",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build: deterministic fonts and no dev overlay. /dev/ui is 404 in production
    // unless FG_DEV_UI=1, which is set here for the test build only.
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/fr/dev/ui`,
    // NEXT_PUBLIC_FG_MOCK_DELAY_MS is inlined at build time: 25 ms instead of 350 ms of fake
    // network time, so the suite does not spend minutes asleep (#76).
    env: { FG_DEV_UI: "1", NEXT_PUBLIC_FG_MOCK_DELAY_MS: "25" },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
