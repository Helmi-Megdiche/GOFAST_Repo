import { expect, test, type Page, type Route } from "@playwright/test";
import { fillSender, start } from "./flow";

/**
 * The client profile on the API adapter (#20, PR 20-d): GET and PATCH /v1/me behind the `account` flag.
 * Built with NEXT_PUBLIC_API_DOMAINS=auth,orders,account (playwright.api.config.ts, port 3200). Every /v1
 * call is answered here with page.route: no API runs. Fake names and phones only.
 * Screens with no API route are hidden and say so: each has a test that fails if mock data shows (RV-28).
 */

type Reply = { status: number; body?: unknown } | "abort";
type Call = { method: string; path: string; body: Record<string, unknown> | null };
type Handler = (call: Call) => Reply | Promise<Reply>;

const meBody = (over: Record<string, unknown> = {}) => ({
  account_id: "acc-customer",
  user_id: "acc-customer",
  kind: "customer",
  role: null,
  contract: null,
  phone_verified: false,
  name: "Nour Hamdi",
  phone: "+21655123456",
  email: null,
  google: false,
  locale: "fr",
  notifications: { sms: true, email: false, offers: false },
  ...over,
});

const err = (code: string, fields: { name: string; reason: string }[] = []) => ({
  error: { code, message: "SERVER TEXT, never shown", fields, trace_id: "tr-e2e" },
});

async function fakeApi(page: Page, on: Record<string, Handler> = {}) {
  const state = { me: meBody(), calls: [] as Call[], unexpected: [] as string[] };
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
    const path = new URL(request.url()).pathname;
    const key = `${request.method()} ${path}`;
    const raw = request.postData();
    const call: Call = { method: request.method(), path, body: raw ? JSON.parse(raw) : null };
    state.calls.push(call);
    const handler =
      on[key] ?? (key === "GET /v1/me" ? () => ({ status: 200, body: state.me }) : undefined);
    if (!handler) {
      state.unexpected.push(key);
      return route.fulfill({ status: 501 });
    }
    const reply = await handler(call);
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

const main = (page: Page) => page.locator("main");
const NOT_YET = "Cette section n’est pas encore disponible.";

async function openProfile(page: Page) {
  await page.goto("/fr/compte/profil");
  await expect(main(page).getByLabel("Nom complet")).toBeVisible();
}

test("C09: the profile reads GET /v1/me and shows what the API says, nothing defaulted", async ({
  page,
}) => {
  const api = await fakeApi(page);
  await openProfile(page);
  await expect(main(page).getByLabel("Nom complet")).toHaveValue("Nour Hamdi");
  await expect(main(page).getByText("Vérifié", { exact: true })).toHaveCount(0);
  await expect(main(page).getByText("Aucun e-mail")).toBeVisible();
  await expect(main(page).getByLabel("SMS pour mes livraisons")).toBeChecked();
  await expect(main(page).getByLabel("E-mail pour mes factures")).not.toBeChecked();
  expect(api.calls("GET /v1/me").length).toBeGreaterThan(0);
  expect(api.state.unexpected).toEqual([]);
});

test("C09: no e-mail link, no Google card, no close card on the API; the page says so", async ({
  page,
}) => {
  await fakeApi(page);
  await openProfile(page);
  await expect(main(page).getByRole("link", { name: "Ajouter un e-mail" })).toHaveCount(0);
  await expect(main(page).getByText("Compte Google")).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "Fermer mon compte" })).toHaveCount(0);
  await expect(
    main(page).getByText("Google et la fermeture du compte ne sont pas encore disponibles."),
  ).toBeVisible();
});

test("C09: a verified phone shows the badge", async ({ page }) => {
  const api = await fakeApi(page);
  api.state.me = meBody({ phone_verified: true });
  await openProfile(page);
  await expect(main(page).getByText("Vérifié", { exact: true })).toBeVisible();
});

test("C09: saving the name sends only {name}", async ({ page }) => {
  const api = await fakeApi(page, {
    "PATCH /v1/me": (c) => ({ status: 200, body: meBody({ name: c.body?.name }) }),
  });
  await openProfile(page);
  await main(page).getByLabel("Nom complet").fill("Lina Mansour");
  await main(page).getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Enregistré.").first()).toBeVisible();
  expect(api.calls("PATCH /v1/me").map((c) => c.body)).toEqual([{ name: "Lina Mansour" }]);
});

test("C09: a 400 on the name shows an inline error, not the server text", async ({ page }) => {
  await fakeApi(page, {
    "PATCH /v1/me": () => ({
      status: 400,
      body: err("VALIDATION_FAILED", [{ name: "name", reason: "minLength" }]),
    }),
  });
  await openProfile(page);
  await main(page).getByLabel("Nom complet").fill("L");
  await main(page).getByRole("button", { name: "Enregistrer" }).click();
  await expect(main(page).getByLabel("Nom complet")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("SERVER TEXT")).toHaveCount(0);
});

test("C09: a 500 on save shows the failure message, not the server text", async ({ page }) => {
  await fakeApi(page, { "PATCH /v1/me": () => ({ status: 500, body: err("INTERNAL_ERROR") }) });
  await openProfile(page);
  await main(page).getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("L'enregistrement a échoué. Réessayez.")).toBeVisible();
  await expect(page.getByText("SERVER TEXT")).toHaveCount(0);
});

test("S2: a 401 on load goes to sign-in with the page to come back to", async ({ page }) => {
  await fakeApi(page, { "GET /v1/me": () => ({ status: 401, body: err("AUTH_REQUIRED") }) });
  await page.goto("/fr/compte/profil");
  await page.waitForURL(/\/fr\/connexion\?next=%2Fcompte%2Fprofil/);
});

test("S2: a 401 on a save also goes to sign-in", async ({ page }) => {
  await fakeApi(page, { "PATCH /v1/me": () => ({ status: 401, body: err("AUTH_REQUIRED") }) });
  await openProfile(page);
  await main(page).getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForURL(/\/fr\/connexion\?next=%2Fcompte%2Fprofil/);
});

test("R902 / RV-17: picking a language sends {locale} alone", async ({ page }) => {
  const api = await fakeApi(page, {
    "PATCH /v1/me": (c) => ({ status: 200, body: meBody({ locale: c.body?.locale }) }),
  });
  await openProfile(page);
  await main(page).getByText("English", { exact: true }).click();
  await expect.poll(() => api.calls("PATCH /v1/me").length).toBeGreaterThan(0);
  expect(api.calls("PATCH /v1/me")[0]?.body).toEqual({ locale: "en" });
});

test("20-d: two quick notification toggles end with both saved, one PATCH at a time", async ({
  page,
}) => {
  let inFlight = 0;
  let maxInFlight = 0;
  const bodies: Record<string, unknown>[] = [];
  await fakeApi(page, {
    "PATCH /v1/me": async (c) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      bodies.push(c.body ?? {});
      await new Promise((resolve) => setTimeout(resolve, 300));
      inFlight -= 1;
      return { status: 200, body: meBody({ notifications: c.body?.notifications }) };
    },
  });
  await openProfile(page);
  await main(page).getByLabel("E-mail pour mes factures").check();
  await main(page).getByLabel("Offres GOFAST").check();
  await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => JSON.stringify(bodies[bodies.length - 1]))
    .toBe(JSON.stringify({ notifications: { sms: true, email: true, offers: true } }));
  expect(maxInFlight).toBe(1);
  await expect(main(page).getByLabel("E-mail pour mes factures")).toBeChecked();
  await expect(main(page).getByLabel("Offres GOFAST")).toBeChecked();
});

test("RV-18: the answer is lost, the server did save: the box stays checked", async ({ page }) => {
  const api = await fakeApi(page, { "PATCH /v1/me": () => "abort" });
  await openProfile(page);
  // The write reached the server, only the answer was cut: GET /v1/me now says it is saved.
  api.state.me = meBody({ notifications: { sms: true, email: false, offers: true } });
  await main(page).getByLabel("Offres GOFAST").check();
  await expect.poll(() => api.calls("PATCH /v1/me").length).toBeGreaterThanOrEqual(1);
  await expect.poll(() => api.calls("GET /v1/me").length).toBeGreaterThanOrEqual(2);
  await expect(main(page).getByLabel("Offres GOFAST")).toBeChecked();
  await expect(page.getByText("L'enregistrement a échoué. Réessayez.")).toHaveCount(0);
});

test("20-d: a failed notification save puts the toggle back", async ({ page }) => {
  await fakeApi(page, { "PATCH /v1/me": () => ({ status: 500, body: err("INTERNAL_ERROR") }) });
  await openProfile(page);
  // click(), not check(): the box goes back at once, and check() throws when the state did not change (RV-29).
  await main(page).getByLabel("Offres GOFAST").click();
  await expect(page.getByText("L'enregistrement a échoué. Réessayez.")).toBeVisible();
  await expect(main(page).getByLabel("Offres GOFAST")).not.toBeChecked();
});

// RV-28: screens with no API route are hidden. Each fails if mock data renders with the flag on.
// The fixture values a mock screen would print: a known e-mail, a saved address, an invoice number.
const FIXTURE_EMAIL = "sami.t@example.tn";
const FIXTURE_ADDRESS_LABEL = "Maison fixture";
const FIXTURE_INVOICE = "FAC-2026-0000001";
const HIDDEN = [
  ["C01 home", "/fr/compte", FIXTURE_EMAIL],
  ["ESP-01 e-mail", "/fr/compte/email", FIXTURE_EMAIL],
  ["C08 addresses", "/fr/compte/adresses", FIXTURE_ADDRESS_LABEL],
  ["C04 invoices", "/fr/compte/factures", FIXTURE_INVOICE],
  ["C05 invoice detail", "/fr/compte/factures/F-2026-0001", FIXTURE_INVOICE],
  ["C06 claims", "/fr/compte/reclamations", FIXTURE_INVOICE],
  ["C07 new claim", "/fr/compte/reclamations/nouvelle", FIXTURE_INVOICE],
  ["C07 claim detail", "/fr/compte/reclamations/R-0001", FIXTURE_INVOICE],
] as const;

/** A saved address and recipient of the signed-in account, as the mock tables hold them. */
async function seedBook(page: Page) {
  await page.addInitScript(
    ([label, address]) => {
      localStorage.setItem(
        "fg.mock.addresses",
        JSON.stringify({
          "adr-e2e": {
            id: "adr-e2e",
            accountId: "acc-customer",
            label,
            text: address,
            landmark: "",
          },
        }),
      );
      localStorage.setItem(
        "fg.mock.recipients",
        JSON.stringify({
          "rec-e2e": {
            id: "rec-e2e",
            accountId: "acc-customer",
            name: "Destinataire fixture",
            phone: "+21655000111",
            address,
            landmark: "",
            locale: "fr",
          },
        }),
      );
    },
    [FIXTURE_ADDRESS_LABEL, "12 rue de test, Tunis"],
  );
}

for (const [name, path, absent] of HIDDEN) {
  test(`hidden (${name}): says "not available yet", seeds no mock table, shows no fixture value`, async ({
    page,
  }) => {
    const api = await fakeApi(page);
    await seedBook(page);
    await page.goto(path);
    await expect(main(page).getByText(NOT_YET)).toBeVisible();
    // "No seed key" alone cannot fail for screens that read the book or the account table.
    await expect(page.locator("body")).not.toContainText(absent);
    await expect(page.locator("body")).not.toContainText(FIXTURE_ADDRESS_LABEL);
    const seeded = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("fg.mock.seed")),
    );
    expect(seeded).toEqual([]);
    expect(api.state.unexpected).toEqual([]);
  });
}

// S5: the saved pickers of the order flow read the mock book. They stay out with the flag on.
for (const [step, path, label] of [
  ["sender", /\/commander\/expediteur$/, "Adresse enregistrée"],
  ["recipient", /\/commander\/destinataire$/, "Destinataire enregistré"],
] as const) {
  test(`hidden (${step} step): no saved-item picker, even when the account has saved items`, async ({
    page,
  }) => {
    await fakeApi(page);
    await seedBook(page);
    await start(page);
    // The recipient step is only reachable once the sender step is done.
    if (step === "recipient") await fillSender(page);
    await expect(page).toHaveURL(path);
    await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
    await expect(main(page).getByLabel(label)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(FIXTURE_ADDRESS_LABEL);
    await expect(page.locator("body")).not.toContainText("Destinataire fixture");
  });
}

test("hidden: the space nav offers no invoices, claims or addresses entry", async ({ page }) => {
  await fakeApi(page);
  await openProfile(page);
  for (const href of ["/fr/compte/factures", "/fr/compte/reclamations", "/fr/compte/adresses"]) {
    await expect(page.locator(`nav a[href="${href}"]`)).toHaveCount(0);
  }
  await expect(page.locator('nav a[href="/fr/compte/commandes"]').first()).toBeVisible();
  await expect(page.locator('nav a[href="/fr/compte/profil"]').first()).toBeVisible();
});

test("C01 hidden: the 'Nouvelle livraison' button still shows, it has no data (S8)", async ({
  page,
}) => {
  await fakeApi(page);
  await page.goto("/fr/compte");
  await expect(page.getByRole("link", { name: "Nouvelle livraison" })).toHaveAttribute(
    "href",
    /\/commander$/,
  );
  await expect(main(page).getByText(NOT_YET).first()).toBeVisible();
});
