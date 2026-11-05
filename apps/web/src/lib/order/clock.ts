/**
 * The one clock of the order flow. Tests replace it (setClock) instead of mocking Date; in the
 * browser, Playwright's page.clock moves Date.now, so the default follows it.
 */
let current: () => number = () => Date.now();

export function now(): number {
  return current();
}

/** Test helper: pass a function returning epoch milliseconds, or nothing to go back to Date.now. */
export function setClock(clock?: () => number): void {
  current = clock ?? (() => Date.now());
}
