import { defineConfig, devices } from "@playwright/test";

const PORT = 3300;

/**
 * The back-office e2e (GH-25 25b): a production build served on its own port. Every /v1 call is answered by the spec itself
 * (page.route), so no API runs: the real staff route is tested in the API (test:int and Schemathesis).
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/artifacts",
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/fr/connexion`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
