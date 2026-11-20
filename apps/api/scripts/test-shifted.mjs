// RV-08: runs the given unit tests (default: the order service) with FG_CLOCK_SHIFT_DAYS (default 40) added to their clock.
// The service reads only its injected clock, so the same suite must pass on any date.
import { spawnSync } from "node:child_process";

const days = process.env.FG_CLOCK_SHIFT_DAYS ?? "40";
const files = process.argv.length > 2 ? process.argv.slice(2) : ["src/orders"];
const result = spawnSync("pnpm", ["exec", "vitest", "run", ...files], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, FG_CLOCK_SHIFT_DAYS: days },
});
process.exit(result.status ?? 1);
