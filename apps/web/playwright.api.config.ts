import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

/**
 * Api-mode e2e (#20, PR 4a): the same app built with NEXT_PUBLIC_API_DOMAINS=auth,orders,account. Every /v1 call
 * is answered by the spec itself (page.route), so no API runs. Own port and own build folder: it
 * never touches the default build. Run: pnpm test:e2e:api
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*-api.spec.ts",
  outputDir: "./test-results/artifacts-api",
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-api" }]]
    : [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/fr/dev/ui`,
    env: {
      FG_DEV_UI: "1",
      NEXT_PUBLIC_FG_MOCK_DELAY_MS: "25",
      NEXT_PUBLIC_API_DOMAINS: "auth,orders,account",
      NEXT_DIST_DIR: ".next-api",
    },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
