import { vi } from "vitest";

// RV-08: a test with a fixed date must also fix the clock. `pnpm test:shifted` moves the system date
// forward (FG_CLOCK_SHIFT_DAYS) so a test that reads the real clock fails once the date has moved.
const days = Number(process.env.FG_CLOCK_SHIFT_DAYS ?? 0);
if (days > 0) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + days * 86_400_000);
}
