import { expect, test, type Page } from "@playwright/test";
import { alertOf, customer, fakeApi, me } from "./helpers";

// GH-25 25b, T29 DR01-DR35: the shell, the guard and the navigation of each role, against a faked /v1.

const links = (page: Page) => page.getByRole("navigation", { name: "Back-office" }).getByRole("link");
const groups = (page: Page) => page.getByRole("navigation", { name: "Back-office" }).getByRole("group");

test("the accountant lands on Factures, sees Finance and not Dispatch", async ({ page }) => {
  await fakeApi(page, { me: me("accountant") });
  await page.goto("/fr");
  await expect(page).toHaveURL(/\/fr\/factures$/);
  await expect(page.locator("main h1")).toHaveText("Factures");
  const nav = page.getByRole("navigation", { name: "Back-office" });
  await expect(nav.getByRole("group", { name: "Finance" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Règlements" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Dispatch" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Factures" })).toHaveAttribute("aria-current", "page");
  await expect(links(page)).toHaveCount(11);
});

test("the cashier lands on Caisses and sees only that", async ({ page }) => {
  await fakeApi(page, { me: me("cashier") });
  await page.goto("/fr");
  await expect(page).toHaveURL(/\/fr\/caisses$/);
  await expect(links(page)).toHaveCount(1);
  await expect(groups(page)).toHaveCount(1);
  await page.goto("/fr/dispatch");
  await expect(page.locator("main h1")).toHaveText("Accès refusé");
});

test("the admin is not a superuser: 'no access' on /fr/caisses and /fr/reglements, in place", async ({ page }) => {
  await fakeApi(page, { me: me("admin") });
  for (const slug of ["caisses", "reglements"]) {
    await page.goto(`/fr/${slug}`);
    await expect(page.locator("main h1")).toHaveText("Accès refusé");
    await expect(page).toHaveURL(new RegExp(`/fr/${slug}$`));
    await expect(page.getByRole("link", { name: "Aller à ma page d'accueil" })).toHaveAttribute("href", "/fr/tableau-de-bord");
  }
  await expect(links(page)).toHaveCount(22);
});

test("each role sees exactly its items in the sidebar (16, 20, 11, 13, 9, 11, 1, 22)", async ({ page }) => {
  const api = await fakeApi(page, { me: me("management") });
  for (const [role, count] of [["management", 16], ["operations", 20], ["agent", 11], ["logistics", 13], ["customer_service", 9], ["accountant", 11], ["cashier", 1], ["admin", 22]] as const) {
    api.me = me(role);
    await page.goto("/fr");
    await expect(page.locator("main h1")).toBeVisible();
    await expect(links(page), role).toHaveCount(count);
  }
});

test("the sidebar items follow the language and the current page is marked", async ({ page }) => {
  await fakeApi(page, { me: me("admin") });
  await page.goto("/en/commandes");
  const nav = page.getByRole("navigation", { name: "Back-office" });
  await expect(nav.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("group", { name: "Operations" })).toBeVisible();
  await page.goto("/ar/commandes");
  await expect(page.getByRole("navigation", { name: "لوحة الإدارة" }).getByRole("link", { name: "الطلبات" })).toHaveAttribute("aria-current", "page");
});

test("no session: the sign-in page, keeping the way back; '/' goes to the sign-in page without ?next=", async ({ page }) => {
  await fakeApi(page);
  await page.goto("/fr/factures");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Ffactures$/);
  await page.goto("/fr");
  await expect(page).toHaveURL(/\/fr\/connexion$/);
});

test("a customer session is closed and the person sees the neutral refusal on the sign-in page", async ({ page }) => {
  const api = await fakeApi(page, { me: customer() });
  await page.goto("/fr/tableau-de-bord");
  await expect(page).toHaveURL(/\/fr\/connexion\?refused=1$/);
  await expect(alertOf(page)).toHaveText("Accès refusé à cet espace.");
  expect(api.calls.map((c) => `${c.method} ${c.path}`)).toContain("DELETE /v1/sessions");
});

test("a driver account is refused like a customer", async ({ page }) => {
  const api = await fakeApi(page, { me: me("driver") });
  await page.goto("/fr/commandes");
  await expect(page).toHaveURL(/\/fr\/connexion\?refused=1$/);
  expect(api.calls.map((c) => `${c.method} ${c.path}`)).toContain("DELETE /v1/sessions");
});

test("a staff account with no role (null, hr) goes to /sans-role from anywhere, and sees only a message and sign-out", async ({ page }) => {
  const api = await fakeApi(page, { me: me(null) });
  for (const role of [null, "hr"]) {
    api.me = me(role);
    await page.goto("/fr/commandes");
    await expect(page).toHaveURL(/\/fr\/sans-role$/);
    await expect(page.locator("main h1")).toHaveText("Aucun rôle attribué");
    await expect(page.getByRole("navigation", { name: "Back-office" })).toHaveCount(0);
  }
});

test("sign-out ends the session and goes to the sign-in page", async ({ page }) => {
  const api = await fakeApi(page, { me: me("agent") });
  await page.goto("/fr/commandes");
  await page.getByRole("button", { name: /Nadia B\./ }).click();
  await expect(page.getByText("Agent de commandes")).toBeVisible();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  expect(api.calls.map((c) => `${c.method} ${c.path}`)).toContain("DELETE /v1/sessions");
  await page.goto("/fr/commandes");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fcommandes$/);
});

test("the user menu changes the language on the same page", async ({ page }) => {
  await fakeApi(page, { me: me("agent") });
  await page.goto("/fr/commandes");
  await page.getByRole("button", { name: /Nadia B\./ }).click();
  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/commandes$/);
  await expect(page.locator("main h1")).toHaveText("Orders");
});

test("a service that does not answer shows a message with a retry, and the retry reads the session again", async ({ page }) => {
  const api = await fakeApi(page, { me: me("agent") });
  await page.route("**/v1/me", (route) => route.abort("connectionfailed"));
  await page.goto("/fr/commandes");
  await expect(alertOf(page)).toContainText("Le service ne répond pas");
  await page.unroute("**/v1/me");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.locator("main h1")).toHaveText("Commandes");
  expect(api.unexpected).toEqual([]);
});

test("an unknown slug is a 404", async ({ page }) => {
  await fakeApi(page, { me: me("admin") });
  const response = await page.goto("/fr/nope");
  expect(response?.status()).toBe(404);
});

test("below the desktop width the sidebar is a drawer: closed at first, opened by the menu button, closed by Escape and by following a link", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await fakeApi(page, { me: me("admin") });
  await page.goto("/fr/commandes");
  await expect(page.locator("main h1")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Back-office" });
  await expect(nav).toBeHidden();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await expect(nav).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await nav.getByRole("link", { name: "Clients" }).click();
  await expect(page).toHaveURL(/\/fr\/clients$/);
  await expect(nav).toBeHidden();
});
