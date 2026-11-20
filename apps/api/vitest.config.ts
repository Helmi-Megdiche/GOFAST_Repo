import { defineConfig } from "vitest/config";

// `pnpm test` needs no Docker: the integration tests (*.int.test.ts) run with `pnpm test:int`.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], exclude: ["src/**/*.int.test.ts"], setupFiles: ["src/test-setup.ts"], globalSetup: ["src/test-global-setup.ts"] },
});
