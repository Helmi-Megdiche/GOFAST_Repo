import { expect, test, type Page } from "@playwright/test";
import { LOCALES, VIEWPORTS, checkPage } from "./helpers";

const PASSWORD = "fastgo-demo-2026";
const CUSTOMER = "+216 98 000 001";
const MERCHANT = "+216 71 000 001";
const TEAM_USER = "+216 71 000 012";
const TEAM_ADMIN = "+216 71 000 011";

async function signInAs(page: Page, phone: string, next?: string) {
  await page.goto(`/fr/connexion${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByRole("textbox", { name: "Téléphone ou e-mail" }).fill(phone);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test("no session: /compte and /pro go to the sign-in page and keep the way back", async ({
  page,
}) => {
  await page.goto("/fr/compte");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fcompte$/);
  await page.goto("/fr/pro");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fpro$/);
});

test("a customer on /pro goes to /compte; a merchant on /compte goes to /pro", async ({ page }) => {
  await signInAs(page, CUSTOMER);
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await page.goto("/fr/pro");
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await page.evaluate(() => localStorage.removeItem("fg.mock.session"));
  await signInAs(page, MERCHANT);
  await expect(page).toHaveURL(/\/fr\/pro$/);
  await page.goto("/fr/compte");
  await expect(page).toHaveURL(/\/fr\/pro$/);
});

test("a merchant and a team user sign in with no next and land on /pro", async ({ page }) => {
  for (const phone of [MERCHANT, TEAM_USER, TEAM_ADMIN]) {
    await page.goto("/fr/connexion");
    await page.evaluate(() => localStorage.removeItem("fg.mock.session"));
    await signInAs(page, phone);
    await expect(page).toHaveURL(/\/fr\/pro$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  const session = JSON.parse((await stored(page, "fg.mock.session")) ?? "null");
  expect(session).toMatchObject({
    accountId: "acc-merchant-validated",
    userId: "usr-yasmine-admin",
    role: "admin",
  });
});

test("a safe next is honoured over the home page", async ({ page }) => {
  await signInAs(page, MERCHANT, "/suivi");
  await expect(page).toHaveURL(/\/fr\/suivi$/);
});

test("sign-out clears the session and the order draft, and keeps the mock tables", async ({
  page,
}) => {
  await signInAs(page, CUSTOMER);
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await page.goto("/fr/suivi?n=FG-7K4M-2QXP"); // seeds the fixture orders
  await expect(page.getByText("Votre livraison est en cours")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("fg.order.draft.v1", '{"version":1}'));
  const orders = await stored(page, "fg.mock.accountOrders");
  expect(orders).not.toBeNull();

  await page.goto("/fr/compte");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  expect(await stored(page, "fg.mock.session")).toBeNull();
  expect(await stored(page, "fg.order.draft.v1")).toBeNull();
  expect(await stored(page, "fg.mock.accountOrders")).toBe(orders);
});

test("the nav has no dead link in PR 0: only the home entry of each space", async ({ page }) => {
  await signInAs(page, CUSTOMER);
  const nav = page.getByRole("navigation", { name: "Mon espace" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await page.evaluate(() => localStorage.removeItem("fg.mock.session"));
  await signInAs(page, MERCHANT);
  await expect(nav.getByRole("link")).toHaveCount(1);
});

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    for (const [path, phone] of [
      ["compte", CUSTOMER],
      ["pro", MERCHANT],
    ] as const) {
      test(`/${locale.code}/${path} at ${viewport.width}px (signed in)`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await signInAs(page, phone);
        await page.goto(`/${locale.code}/${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await checkPage(page, locale, `account-${path}-${locale.code}-${viewport.width}`);
      });
    }
  }
}
