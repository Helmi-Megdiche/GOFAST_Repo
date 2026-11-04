/** Fake network time, so loading states are visible. Zero under test. */
export async function mockDelay(ms = 350): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
