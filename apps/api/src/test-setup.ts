import { vi } from "vitest";

// RV-08: `pnpm test` also runs the unit tests of the order service with the system date moved forward (FG_CLOCK_SHIFT_DAYS, 40 by
// default in scripts/test-shifted.mjs), as packages/domain does. A test that fixes a date instead of reading the clock fails there.
const days = Number(process.env.FG_CLOCK_SHIFT_DAYS ?? 0);
if (days > 0) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + days * 86_400_000);
}
