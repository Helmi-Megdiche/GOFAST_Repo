import { expect, test } from "@playwright/test";

test("/ goes to /fr, even when the browser prefers Arabic", async ({ browser }) => {
  const context = await browser.newContext({
    locale: "ar-TN",
    extraHTTPHeaders: { "accept-language": "ar-TN,ar;q=0.9" },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/fr$/);
  await context.close();
});

test("a visitor who picked a language stays on it when opening /", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/fr$/);

  // Pick Arabic with the switcher
  await page.getByRole("group").getByRole("link", { name: "عربي" }).click();
  await expect(page).toHaveURL(/\/ar$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("the language switcher keeps the current page", async ({ page }) => {
  await page.goto("/fr/dev/ui");
  await page.getByRole("group").getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/en\/dev\/ui$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("unknown locale and unknown page give a 404", async ({ page }) => {
  const unknownLocale = await page.goto("/de/dev/ui");
  expect(unknownLocale?.status()).toBe(404);

  const unknownPage = await page.goto("/fr/does-not-exist");
  expect(unknownPage?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});
