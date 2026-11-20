import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * The api tests read the bundled contract (`packages/contract/dist/openapi.bundled.yaml`), which only exists after
 * `pnpm --filter @fastgo/contract bundle`. Turbo runs that first (turbo.json: test dependsOn ^bundle), but a plain
 * `pnpm --filter @fastgo/api test` right after an install does not: four files then failed on the first, cold run and
 * passed on every rerun (#25, round 1). So the suite bundles the contract itself when the file is missing.
 */
export default function setup(): void {
  const contractDir = join(dirname(createRequire(import.meta.url).resolve("@fastgo/contract")), "..");
  if (existsSync(join(contractDir, "dist", "openapi.bundled.yaml"))) return;
  execSync("pnpm bundle", { cwd: contractDir, stdio: "inherit" });
}
