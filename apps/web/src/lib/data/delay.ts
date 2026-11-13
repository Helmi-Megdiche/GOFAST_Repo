// Fake network time, so loading states are visible. The e2e build shortens it through
// NEXT_PUBLIC_FG_MOCK_DELAY_MS (see playwright.config.ts) to keep CI fast. Parsed once, here.
// Calls that pass their own duration (150, 250, 600 ms) are scaled by the same ratio, so the
// default build behaves exactly as before.
const DEFAULT_DELAY_MS = 350;

function readDelayMs(): number {
  const raw = process.env.NEXT_PUBLIC_FG_MOCK_DELAY_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_DELAY_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DELAY_MS;
}

const SCALE = readDelayMs() / DEFAULT_DELAY_MS;

/** Fake network time, so loading states are visible. Zero under test. */
export async function mockDelay(ms = DEFAULT_DELAY_MS): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  await new Promise((resolve) => setTimeout(resolve, ms * SCALE));
}
