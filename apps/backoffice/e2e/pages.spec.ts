import { expect, test } from "@playwright/test";
import { LOCALES, VIEWPORTS, checkPage, fakeApi, me } from "./helpers";

// GH-25 25b: every kind of page in the back-office, in fr, ar and en, at 1440 and 360 px: the right lang and dir, no horizontal scroll,
// no axe violation. /v1 is faked with page.route: no API runs.

const PAGES = [
  { name: "A00 sign-in", path: "connexion", person: null, heading: /Espace équipes|Staff area|فضاء الفرق/ },
  { name: "the shell with A01 (admin)", path: "tableau-de-bord", person: me("admin"), heading: /Tableau de bord|Dashboard|لوحة القيادة/ },
  { name: "a placeholder (agent, commandes)", path: "commandes", person: me("agent"), heading: /Commandes|Orders|الطلبات/ },
  { name: "no access (admin, caisses)", path: "caisses", person: me("admin"), heading: /Accès refusé|No access|لا يوجد وصول/ },
  { name: "no role yet", path: "sans-role", person: me(null), heading: /Aucun rôle attribué|No role yet|لم يُسنَد أي دور/ },
] as const;

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    for (const spec of PAGES) {
      test(`${spec.name} in ${locale.code} at ${viewport.width}px: lang, dir, no horizontal scroll, axe`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const api = await fakeApi(page, { me: spec.person });
        await page.goto(`/${locale.code}/${spec.path}`);
        await expect(page.locator("main h1")).toBeVisible();
        await expect(page.locator("main h1")).toHaveText(spec.heading);
        await expect(page).toHaveURL(new RegExp(`/${locale.code}/${spec.path}$`)); // "no access" shows in place, nothing redirected
        await checkPage(page, locale);
        expect(api.unexpected).toEqual([]);
      });
    }
  }
}

test("the sidebar sits on the start side: left in French, right in Arabic", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeApi(page, { me: me("admin") });
  for (const [code, side] of [["fr", "left"], ["ar", "right"]] as const) {
    await page.goto(`/${code}/tableau-de-bord`);
    const nav = page.getByRole("navigation", { name: /Back-office|لوحة الإدارة/ });
    await expect(nav).toBeVisible();
    const box = (await nav.boundingBox())!;
    const width = page.viewportSize()!.width;
    if (side === "left") expect(box.x).toBeLessThan(width / 2);
    else expect(box.x + box.width).toBeGreaterThan(width / 2);
  }
});
