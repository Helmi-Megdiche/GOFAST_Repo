import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Client orders and public tracking on the API adapter (#20, PR 20-c).
 * Built with NEXT_PUBLIC_API_DOMAINS=auth,orders (playwright.api.config.ts, port 3200). Every /v1
 * call is answered here with page.route: no API runs. Fake names and phones only.
 */

const CODE = "FG-5A1C-0002";
const ID = "0b6f7f0e-1111-4222-8333-444455556666";

type Reply = { status: number; body?: unknown } | "abort";
type Call = { method: string; path: string; search: URLSearchParams; headers: Record<string, string>; body: unknown };
type Handler = (call: Call) => Reply;

const me = {
  account_id: "acc-customer",
  user_id: "acc-customer",
  kind: "customer",
  role: null,
  contract: null,
  phone_verified: true,
  name: "Nour H.",
  phone: "+21655123456",
  email: null,
  google: false,
  locale: "fr",
  notifications: {},
};

const order = (over: Record<string, unknown> = {}) => ({
  id: ID,
  tracking_number: CODE,
  address_unconfirmed: false,
  departure: { zone_id: "z1", zone_name: "Tunis" },
  arrival: { zone_id: "z2", zone_name: "Sfax" },
  status: "confirmed",
  service: "express",
  payment_mode: "cashPickup",
  freight_payer: "sender",
  total_millimes: 12500,
  lines: [{ kind: "base", unit_millimes: 12500, count: 1, millimes: 12500 }],
  created_at: "2026-11-10T08:00:00Z",
  eta_at: "2026-11-10T12:00:00Z",
  sender: { name: "Amel Test", phone: "+21698000001", address: "1 rue A", city: "Tunis" },
  recipient: { name: "Sami Test", phone: "+21698000002", address: "2 rue B", city: "Sfax" },
  parcels: [
    {
      id: "p1",
      index: 1,
      barcode: "BC-1",
      type: "medium",
      weight_declared_g: 1500,
      status: "to_collect",
      attempts: 0,
    },
  ],
  loss_reported: false,
  cancel: null,
  ...over,
});

const tracking = (over: Record<string, unknown> = {}) => ({
  status: "confirmed",
  eta_at: "2026-11-10T12:00:00Z",
  history: [
    { status: "received", at: "2026-11-10T08:00:00Z" },
    { status: "confirmed", at: "2026-11-10T08:05:00Z" },
  ],
  from_city: "Tunis",
  to_city: "Sfax",
  parcel_count: 1,
  parcel_outcomes: ["to_collect"],
  ...over,
});

const err = (code: string, fields: { name: string; reason: string }[] = []) => ({
  error: { code, message: "SERVER TEXT, never shown", fields, trace_id: "tr-e2e" },
});

/** A fake /v1 with one mutable order; every call is recorded, anything not planned is a failure. */
async function fakeApi(page: Page, on: Record<string, Handler> = {}) {
  const state = { order: order(), calls: [] as Call[], unexpected: [] as string[] };
  const defaults: Record<string, Handler> = {
    "GET /v1/me": () => ({ status: 200, body: me }),
    "GET /v1/orders": (c) => ({
      status: 200,
      body: {
        items: c.search.get("tracking") && c.search.get("tracking") !== CODE ? [] : [state.order],
        next_cursor: null,
      },
    }),
    [`GET /v1/orders/${ID}`]: () => ({ status: 200, body: state.order }),
    [`GET /v1/tracking/${CODE}`]: () => ({
      status: 200,
      body: tracking({ status: state.order.status }),
    }),
  };
  await page.addInitScript(() =>
    localStorage.setItem(
      "fg.mock.session",
      JSON.stringify({
        accountId: "acc-customer",
        userId: "acc-customer",
        role: null,
        kind: "customer",
        contract: null,
        phoneVerified: true,
        maskedPhone: "+216 55 ••• 456",
      }),
    ),
  );
  await page.route("**/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    state.calls.push({
      method: request.method(),
      path: url.pathname,
      search: url.searchParams,
      headers: request.headers(),
      body: request.postData() ? JSON.parse(request.postData()!) : null,
    });
    const handler = on[key] ?? defaults[key];
    if (!handler) {
      state.unexpected.push(key);
      return route.fulfill({ status: 501 });
    }
    const reply = handler(state.calls[state.calls.length - 1]!);
    if (reply === "abort") return route.abort("failed");
    return route.fulfill({
      status: reply.status,
      contentType: "application/json",
      body: reply.body === undefined ? undefined : JSON.stringify(reply.body),
    });
  });
  return {
    state,
    calls: (key: string) => state.calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}

const dialog = (page: Page) => page.getByRole("dialog");

test("C02: the list reads GET /v1/orders and shows the order from the API", async ({ page }) => {
  const api = await fakeApi(page);
  await page.goto("/fr/compte/commandes");
  await expect(page.getByRole("link", { name: new RegExp(CODE) }).first()).toBeVisible();
  await expect(page.getByText("Sami Test").first()).toBeVisible();
  await expect(page.getByText("12,500 TND").first()).toBeVisible();
  expect(api.calls("GET /v1/orders").length).toBeGreaterThan(0);
  expect(api.state.unexpected).toEqual([]);
});

test("C02: an empty account shows the empty state", async ({ page }) => {
  await fakeApi(page, { "GET /v1/orders": () => ({ status: 200, body: { items: [], next_cursor: null } }) });
  await page.goto("/fr/compte/commandes");
  await expect(page.getByRole("link", { name: "Commander" }).first()).toBeVisible();
});

test("C02: a server error shows the retry view, not the server text", async ({ page }) => {
  await fakeApi(page, { "GET /v1/orders": () => ({ status: 500, body: err("INTERNAL_ERROR") }) });
  await page.goto("/fr/compte/commandes");
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await expect(page.getByText("SERVER TEXT")).toHaveCount(0);
});

test("C03: the detail reads the order by id and the timeline from the public tracking", async ({
  page,
}) => {
  const api = await fakeApi(page);
  await page.goto(`/fr/compte/commandes/${CODE}`);
  await expect(page.getByText("Sami Test").first()).toBeVisible();
  // B3: the API has no slip URL, so there is no "Bon de commande" button (not a dead link).
  await expect(page.getByRole("link", { name: "Bon de commande" })).toHaveCount(0);
  expect(api.calls("GET /v1/orders")[0]?.search.get("tracking")).toBe(CODE);
  expect(api.calls(`GET /v1/orders/${ID}`)).toHaveLength(1);
  expect(api.calls(`GET /v1/tracking/${CODE}`).length).toBeGreaterThan(0);
  expect(api.state.unexpected).toEqual([]);
});

test("CMD-08: cancel sends accepted_fee and no Idempotency-Key, then shows the canceled order", async ({
  page,
}) => {
  const api = await fakeApi(page, {
    [`POST /v1/orders/${ID}/cancel`]: () => {
      state.order = order({ status: "canceled" });
      return { status: 200, body: { status: "canceled", fee: "none" } };
    },
  });
  const state = api.state;
  await page.goto(`/fr/compte/commandes/${CODE}`);
  await page.getByRole("button", { name: "Annuler la commande" }).click();
  await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByText("Commande annulée").first()).toBeVisible();
  const post = api.calls(`POST /v1/orders/${ID}/cancel`);
  expect(post).toHaveLength(1);
  expect(post[0]?.body).toEqual({ accepted_fee: "none" });
  expect(post[0]?.headers["idempotency-key"]).toBeUndefined();
});

test("CMD-08: a 409 notCancellable reads the order again and shows its real state", async ({
  page,
}) => {
  const api = await fakeApi(page, {
    [`POST /v1/orders/${ID}/cancel`]: () => {
      api.state.order = order({ status: "picked_up" });
      return { status: 409, body: err("STATE_CONFLICT", [{ name: "status", reason: "notCancellable" }]) };
    },
  });
  await page.goto(`/fr/compte/commandes/${CODE}`);
  const reads = () => api.calls(`GET /v1/orders/${ID}`).length;
  await page.getByRole("button", { name: "Annuler la commande" }).click();
  const before = reads();
  await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByRole("button", { name: "Annuler la commande" })).toHaveCount(0);
  await expect.poll(reads).toBeGreaterThan(before);
  await expect(page.getByText("SERVER TEXT")).toHaveCount(0);
});

test("CMD-08: a 422 feeRequired re-opens the dialog with the fee line", async ({ page }) => {
  const api = await fakeApi(page, {
    [`POST /v1/orders/${ID}/cancel`]: () => {
      api.state.order = order({ status: "assigned" });
      return { status: 422, body: err("RULE_REFUSED", [{ name: "accepted_fee", reason: "feeRequired" }]) };
    },
  });
  await page.goto(`/fr/compte/commandes/${CODE}`);
  await page.getByRole("button", { name: "Annuler la commande" }).click();
  await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
  await expect(dialog(page)).toContainText("Des frais d'annulation s'appliquent");
  // The page said "free" and the order changed: the dialog says so.
  await expect(dialog(page)).toContainText("La situation de votre commande a changé");
});

test("CMD-08 (B1): an assigned order is not announced as free; a 422 shows the fee without the changed line", async ({
  page,
}) => {
  const posts: unknown[] = [];
  const api = await fakeApi(page, {
    [`POST /v1/orders/${ID}/cancel`]: (call) => {
      posts.push(call.body);
      const accepted = (call.body as { accepted_fee: string }).accepted_fee;
      if (accepted === "none") {
        return { status: 422, body: err("RULE_REFUSED", [{ name: "accepted_fee", reason: "feeRequired" }]) };
      }
      api.state.order = order({ status: "canceled" });
      return { status: 200, body: { status: "canceled", fee: "applies" } };
    },
  });
  api.state.order = order({ status: "assigned" });
  await page.goto(`/fr/compte/commandes/${CODE}`);
  await page.getByRole("button", { name: "Annuler la commande" }).click();
  await expect(dialog(page)).toContainText("gratuite tant que le livreur n'est pas arrivé");
  await expect(dialog(page)).not.toContainText("n'est pas encore arrivé");
  await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
  await expect(dialog(page)).toContainText("Des frais d'annulation s'appliquent");
  await expect(dialog(page)).not.toContainText("La situation de votre commande a changé");
  await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByText("Commande annulée").first()).toBeVisible();
  expect(posts).toEqual([{ accepted_fee: "none" }, { accepted_fee: "applies" }]);
});

test("S2: a 401 on the list sends the client to sign-in, with the page to come back to", async ({
  page,
}) => {
  await fakeApi(page, { "GET /v1/orders": () => ({ status: 401, body: err("AUTH_REQUIRED") }) });
  await page.goto("/fr/compte/commandes");
  await page.waitForURL(/\/fr\/connexion\?next=%2Fcompte%2Fcommandes/);
});

test("SUI-01: /suivi reads GET /v1/tracking/{number}; the URL stays the source of truth", async ({
  page,
}) => {
  const api = await fakeApi(page);
  await page.goto(`/fr/suivi?n=${CODE.toLowerCase()}`);
  await expect(page.getByText("Tunis")).toBeVisible();
  expect(api.calls(`GET /v1/tracking/${CODE}`).length).toBeGreaterThan(0);
  await expect(page.locator("input").first()).toHaveValue(CODE);
});

test("SUI-01: a 404 is the not-found message, a 500 says tracking is unavailable", async ({
  page,
}) => {
  await fakeApi(page, {
    [`GET /v1/tracking/${CODE}`]: () => ({ status: 404, body: err("NOT_FOUND") }),
    "GET /v1/tracking/FG-7K4M-2QXP": () => ({ status: 500, body: err("INTERNAL_ERROR") }),
  });
  await page.goto(`/fr/suivi?n=${CODE}`);
  await expect(page.getByText("Numéro introuvable").or(page.getByText(/introuvable/i)).first()).toBeVisible();
  await page.goto("/fr/suivi?n=FG-7K4M-2QXP");
  await expect(page.getByText("Suivi momentanément indisponible")).toBeVisible();
});

test("SUI-01 (S5): Try again on the same number asks the API again", async ({ page }) => {
  let hits = 0;
  const api = await fakeApi(page, {
    [`GET /v1/tracking/${CODE}`]: () =>
      ++hits === 1
        ? { status: 500, body: err("INTERNAL_ERROR") }
        : { status: 200, body: tracking() },
  });
  await page.goto(`/fr/suivi?n=${CODE}`);
  await expect(page.getByText("Suivi momentanément indisponible")).toBeVisible();
  await page.getByRole("button", { name: "Suivre" }).click();
  await expect(page.getByText("Tunis")).toBeVisible();
  expect(api.calls(`GET /v1/tracking/${CODE}`)).toHaveLength(2);
});

test("CMD-08 (S3): a server error on cancel keeps the alert and reads the order again", async ({
  page,
}) => {
  const api = await fakeApi(page, {
    [`POST /v1/orders/${ID}/cancel`]: () => {
      // The cancel went through on the server, but the answer was an error.
      api.state.order = order({ status: "canceled" });
      return { status: 500, body: err("INTERNAL_ERROR") };
    },
  });
  await page.goto(`/fr/compte/commandes/${CODE}`);
  await page.getByRole("button", { name: "Annuler la commande" }).click();
  const reads = () => api.calls(`GET /v1/orders/${ID}`).length;
  const before = reads();
  await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
  await expect.poll(reads).toBeGreaterThan(before);
  await expect(page.getByText("Commande annulée").first()).toBeVisible();
});
