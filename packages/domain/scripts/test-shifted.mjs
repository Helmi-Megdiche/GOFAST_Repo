// RV-08: runs the unit suite with the system date moved FG_CLOCK_SHIFT_DAYS (default 40) ahead.
import { spawnSync } from "node:child_process";

const days = process.env.FG_CLOCK_SHIFT_DAYS ?? "40";
const result = spawnSync("pnpm", ["exec", "vitest", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, FG_CLOCK_SHIFT_DAYS: days },
});
process.exit(result.status ?? 1);
