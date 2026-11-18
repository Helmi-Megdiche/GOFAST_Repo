import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** The three languages and the two widths of every page check (CLAUDE.md: mobile first, fr / ar / en). */
export const LOCALES = [
  { code: "fr", dir: "ltr" },
  { code: "ar", dir: "rtl" },
  { code: "en", dir: "ltr" },
] as const;
export const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 360, height: 800 },
] as const;

/** A person as GET /v1/me and the sign-in answer them. Fake names only. */
export const me = (role: string | null, over: Record<string, unknown> = {}) => ({
  account_id: `acc-${role ?? "none"}`,
  user_id: `acc-${role ?? "none"}`,
  kind: "staff",
  role,
  contract: null,
  phone_verified: true,
  name: "Nadia B.",
  phone: "+21620123456",
  email: "nadia@fastgo.example",
  google: false,
  locale: "fr",
  notifications: {},
  ...over,
});
export const customer = () => me("individual", { kind: "customer", name: "Nour H." });

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "abort";
export type Call = { method: string; path: string; body: unknown };

const unauthorized = { error: { code: "AUTH_REQUIRED", message: "SERVER TEXT, never shown", fields: [{ name: "identifier", reason: "invalidCredentials" }], trace_id: "tr-e2e" } };

/**
 * A fake /v1: GET /v1/me answers the person of `state.me` (401 when null), POST /v1/staff/sessions answers `state.signIn` (and the person
 * becomes `state.me` on a 201), DELETE /v1/sessions ends it. Every call is recorded; anything else is a failure of the test.
 */
export async function fakeApi(page: Page, initial: { me?: ReturnType<typeof me> | null; signIn?: Reply } = {}) {
  const state = {
    me: initial.me ?? null,
    signIn: initial.signIn ?? ({ status: 401, body: unauthorized } as Reply),
    calls: [] as Call[],
    unexpected: [] as string[],
  };
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      body = undefined;
    }
    state.calls.push({ method: request.method(), path, body });
    const json = (reply: Exclude<Reply, "abort">) =>
      route.fulfill({ status: reply.status, contentType: "application/json", headers: reply.headers, body: reply.body === undefined ? "" : JSON.stringify(reply.body) });
    if (request.method() === "GET" && path === "/v1/me") return state.me ? json({ status: 200, body: state.me }) : json({ status: 401, body: unauthorized });
    if (request.method() === "POST" && path === "/v1/staff/sessions") {
      if (state.signIn === "abort") return route.abort("connectionfailed");
      if (state.signIn.status === 201) state.me = state.signIn.body as ReturnType<typeof me>;
      return json(state.signIn);
    }
    if (request.method() === "DELETE" && path === "/v1/sessions") {
      state.me = null;
      return route.fulfill({ status: 204 });
    }
    state.unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 500, body: "unexpected" });
  });
  return state;
}

/** The alerts of the page, not Next's own route announcer (it is a role="alert" too). */
export const alertOf = (page: Page) => page.locator("main").getByRole("alert");

export const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** lang and dir from the locale, no horizontal scroll, and no axe violation (WCAG 2.0 to 2.2, A and AA). */
export async function checkPage(page: Page, locale: (typeof LOCALES)[number]) {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", locale.code);
  await expect(html).toHaveAttribute("dir", locale.dir);
  expect(await overflow(page), "horizontal overflow in px").toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) })),
    "axe violations",
  ).toEqual([]);
}
