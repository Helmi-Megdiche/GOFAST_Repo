import { expect, test } from "@playwright/test";

/**
 * Language switcher and auth pages without JavaScript (PR #5, group C, items 19 and 22).
 * Kept apart from auth.spec.ts, which belongs to the auth logic work.
 */

test("the language switcher keeps ?next= on /connexion (item 19)", async ({ page }) => {
  await page.goto("/fr/connexion?next=%2Fsuivi");
  await page.locator('header a[hreflang="ar"]').click();
  await expect(page).toHaveURL(/\/ar\/connexion\?next=%2Fsuivi$/);
});

test("the language switcher keeps ?n= on /suivi (item 19)", async ({ page }) => {
  await page.goto("/fr/suivi?n=FG-7K4M-2QXP");
  await page.locator('header a[hreflang="en"]').click();
  await expect(page).toHaveURL(/\/en\/suivi\?n=FG-7K4M-2QXP$/);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("/connexion, /code and /google-telephone say the page needs JavaScript (item 22)", async ({
    page,
    request,
  }) => {
    for (const path of ["/fr/connexion", "/fr/code", "/fr/google-telephone"]) {
      await page.goto(path);
      // Chromium parses <noscript> as if scripts ran when Playwright turns JavaScript off, so the
      // message is checked in the server HTML: a browser without JavaScript shows it.
      const html = await (await request.get(path)).text();
      expect(html, path).toMatch(
        /<noscript><p[^>]*>Cette page a besoin de JavaScript\. Activez-le dans votre navigateur\.<\/p><\/noscript>/,
      );
    }
  });
});
