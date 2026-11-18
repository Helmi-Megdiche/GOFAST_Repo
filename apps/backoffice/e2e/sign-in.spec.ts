import { expect, test, type Page } from "@playwright/test";
import { alertOf, customer, fakeApi, me } from "./helpers";

// GH-25 25b, T60: the A00 flows against a faked /v1. The real staff route is tested in the API (test:int, Schemathesis).

const fill = async (page: Page, code = "417823") => {
  await page.getByLabel(/E-mail professionnel/).fill("nadia@fastgo.example");
  await page.getByLabel("Mot de passe", { exact: true }).fill("a long password");
  await page.getByLabel(/Code de l'application/).fill(code);
};
const submit = (page: Page) => page.getByRole("button", { name: "Se connecter" }).click();
const NEUTRAL = "Identifiants ou code incorrects.";

test("happy path: the three fields are sent, the person lands on the dashboard of their role, and the session shows", async ({ page }) => {
  const api = await fakeApi(page, { signIn: { status: 201, body: me("agent") } });
  await page.goto("/fr/connexion");
  await fill(page);
  await submit(page);
  await expect(page).toHaveURL(/\/fr\/tableau-de-bord$/);
  await expect(page.locator("main h1")).toHaveText("Tableau de bord");
  expect(api.calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([{ identifier: "nadia@fastgo.example", password: "a long password", code: "417823" }]);
  await expect(page.getByRole("navigation", { name: "Back-office" }).getByRole("link", { name: "Commandes" })).toBeVisible();
  expect(api.unexpected).toEqual([]);
});

test("a wrong code is one neutral message that never says which part was wrong, and the next try needs a new code", async ({ page }) => {
  await fakeApi(page);
  await page.goto("/fr/connexion");
  await fill(page, "000000");
  await submit(page);
  await expect(alertOf(page)).toHaveText(NEUTRAL);
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  await expect(page.getByLabel(/Code de l'application/)).toHaveValue(""); // a code is single use
  await expect(page.getByLabel(/E-mail professionnel/)).toHaveValue("nadia@fastgo.example");
  expect(await alertOf(page).innerText()).not.toMatch(/mot de passe|code de l|e-mail/i);
});

test("every kind of 401 shows the same message", async ({ page }) => {
  const api = await fakeApi(page);
  const shown: string[] = [];
  for (const body of [undefined, { error: { code: "AUTH_REQUIRED", fields: [{ name: "identifier", reason: "invalidCredentials" }] } }, { error: { code: "AUTH_REQUIRED", fields: [] } }]) {
    api.signIn = { status: 401, body };
    await page.goto("/fr/connexion");
    await fill(page);
    await submit(page);
    shown.push(await alertOf(page).innerText());
  }
  expect(new Set(shown)).toEqual(new Set([NEUTRAL]));
});

test("429 shows the wait from Retry-After", async ({ page }) => {
  await fakeApi(page, { signIn: { status: 429, headers: { "Retry-After": "42" }, body: { error: { code: "TOO_MANY_ATTEMPTS", fields: [] } } } });
  await page.goto("/fr/connexion");
  await fill(page);
  await submit(page);
  await expect(alertOf(page)).toContainText(/Trop de tentatives. Réessayez dans (42|41) s\./);
});

test("400 shows the error of the field the server named", async ({ page }) => {
  await fakeApi(page, { signIn: { status: 400, body: { error: { code: "VALIDATION_FAILED", fields: [{ name: "code", reason: "pattern" }] } } } });
  await page.goto("/fr/connexion");
  await fill(page);
  await submit(page);
  await expect(page.getByText("Saisissez les 6 chiffres du code.")).toBeVisible();
});

test("a code that is not 6 digits, and an empty form, are refused in the browser before anything is sent", async ({ page }) => {
  const api = await fakeApi(page);
  await page.goto("/fr/connexion");
  await submit(page);
  await expect(page.getByText("Saisissez votre identifiant.")).toBeVisible();
  await expect(page.getByText("Saisissez votre mot de passe.")).toBeVisible();
  await expect(page.getByText("Saisissez les 6 chiffres du code.")).toBeVisible();
  await fill(page, "123");
  await submit(page);
  await expect(page.getByText("Saisissez les 6 chiffres du code.")).toBeVisible();
  expect(api.calls.filter((c) => c.method === "POST")).toEqual([]);
});

test("a network error says the service does not answer; the retry asks for a NEW code (the first works only once) and sends nothing by itself", async ({ page }) => {
  const api = await fakeApi(page, { signIn: "abort" });
  await page.goto("/fr/connexion");
  await fill(page);
  await submit(page);
  await expect(alertOf(page)).toContainText("Le service ne répond pas");
  api.signIn = { status: 201, body: me("operations") };
  await page.getByRole("button", { name: "Réessayer" }).click();
  // Nothing was sent again: the old code is spent. The notice is gone, the code is empty and has the focus.
  await expect(alertOf(page)).toHaveCount(0);
  await expect(page.getByLabel(/Code de l'application/)).toHaveValue("");
  await expect(page.getByLabel(/Code de l'application/)).toBeFocused();
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  await page.keyboard.type("902144");
  await submit(page);
  await expect(page).toHaveURL(/\/fr\/tableau-de-bord$/);
  const posts = api.calls.filter((c) => c.method === "POST");
  expect(posts).toHaveLength(2);
  expect(posts[0]?.body).toEqual({ identifier: "nadia@fastgo.example", password: "a long password", code: "417823" });
  expect(posts[1]?.body).toEqual({ identifier: "nadia@fastgo.example", password: "a long password", code: "902144" });
});

test("a customer who somehow gets a session is signed out at once and sees the neutral refusal", async ({ page }) => {
  const api = await fakeApi(page, { signIn: { status: 201, body: customer() } });
  await page.goto("/fr/connexion");
  await fill(page);
  await submit(page);
  await expect(alertOf(page)).toHaveText("Accès refusé à cet espace.");
  expect(api.calls.map((c) => `${c.method} ${c.path}`)).toContain("DELETE /v1/sessions");
  await expect(page).toHaveURL(/\/fr\/connexion$/);
});

test("a staff account with no role goes to the no-role page", async ({ page }) => {
  await fakeApi(page, { signIn: { status: 201, body: me(null) } });
  await page.goto("/fr/connexion");
  await fill(page);
  await submit(page);
  await expect(page).toHaveURL(/\/fr\/sans-role$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aucun rôle attribué");
});

test("?next= is honoured for a screen of the role, and refused otherwise", async ({ page }) => {
  await fakeApi(page, { signIn: { status: 201, body: me("accountant") } });
  await page.goto("/fr/connexion?next=%2Freglements");
  await fill(page);
  await submit(page);
  await expect(page).toHaveURL(/\/fr\/reglements$/);

  const cashier = await page.context().newPage();
  await fakeApi(cashier, { signIn: { status: 201, body: me("cashier") } });
  await cashier.goto("/fr/connexion?next=%2Fdispatch");
  await fill(cashier);
  await submit(cashier);
  await expect(cashier).toHaveURL(/\/fr\/caisses$/); // the cashier may not see Dispatch: the landing page

  const evil = await page.context().newPage();
  await fakeApi(evil, { signIn: { status: 201, body: me("agent") } });
  await evil.goto("/fr/connexion?next=https%3A%2F%2Fevil.example%2Fcommandes");
  await fill(evil);
  await submit(evil);
  await expect(evil).toHaveURL(/\/fr\/tableau-de-bord$/);
});

test("A00 with a staff session that has no back-office role (null, hr) goes to the no-role page, not to the form and not to a landing page", async ({ page }) => {
  const api = await fakeApi(page, { me: me(null) });
  for (const role of [null, "hr", "root"]) {
    api.me = me(role);
    await page.goto("/fr/connexion");
    await expect(page).toHaveURL(/\/fr\/sans-role$/);
    await expect(page.locator("main h1")).toHaveText("Aucun rôle attribué");
  }
});

test("A00 with a customer session open still shows the form (the person may be signing in as staff)", async ({ page }) => {
  await fakeApi(page, { me: customer() });
  await page.goto("/fr/connexion");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
});

test("A00 with a staff session already open goes straight to the landing page", async ({ page }) => {
  await fakeApi(page, { me: me("cashier") });
  await page.goto("/fr/connexion");
  await expect(page).toHaveURL(/\/fr\/caisses$/);
});
