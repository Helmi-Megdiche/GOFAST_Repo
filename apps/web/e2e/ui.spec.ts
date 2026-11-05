import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Screenshots for visual comparison with docs/ui/screenshots. test-results/ is git-ignored.
const SHOTS = path.join(process.cwd(), "test-results", "shots");

const LOCALES = [
  { code: "fr", dir: "ltr", font: /Inter/ },
  { code: "ar", dir: "rtl", font: /Noto Sans Arabic/ },
] as const;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 360, height: 800 },
] as const;

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`/${locale.code}/dev/ui at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/${locale.code}/dev/ui`);
      await page.evaluate(() => document.fonts.ready);

      // lang and dir come from the locale
      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", locale.code);
      await expect(html).toHaveAttribute("dir", locale.dir);

      // Noto Sans Arabic leads automatically under dir="rtl"; Inter leads otherwise
      const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      expect(bodyFont.split(",")[0]).toMatch(locale.font);

      // No horizontal scroll (CLAUDE.md: every page works at 360 px)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({
        path: path.join(SHOTS, `dev-ui-${locale.code}-${viewport.width}.png`),
        fullPage: true,
      });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const summary = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
      }));
      expect(summary, "axe violations").toEqual([]);
    });
  }
}

test("directional icons flip in Arabic and not in French", async ({ page }) => {
  const transform = (locale: string) =>
    page.goto(`/${locale}/dev/ui`).then(() =>
      page.evaluate(() => {
        const icons = [...document.querySelectorAll("li")].filter((li) => li.textContent === "cr");
        const svg = icons[0]?.querySelector("svg");
        return svg ? getComputedStyle(svg).scale : "missing";
      }),
    );

  const fr = await transform("fr");
  const ar = await transform("ar");
  expect(fr).toBe("none");
  expect(ar).toBe("-1 1");
});

test("tabs follow the arrow keys in the reading direction", async ({ page }) => {
  await page.goto("/ar/dev/ui");
  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowLeft"); // RTL: left is "next"
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
});

test("the current language is legible in the header switcher", async ({ page }) => {
  for (const locale of ["fr", "ar"]) {
    await page.goto(`/${locale}/dev/ui`);
    const current = page.getByRole("group").first().locator('[aria-current="true"]');
    const [color, background] = await current.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.color, style.backgroundColor];
    });
    // navy text on a white pill, never white on white
    expect(background, locale).toBe("rgb(255, 255, 255)");
    expect(color, locale).not.toBe("rgb(255, 255, 255)");
  }
});

test("Dialog: opens on the safe button, Escape closes it, focus returns to the opener", async ({
  page,
}) => {
  await page.goto("/fr/dev/ui");
  const opener = page.getByRole("button", { name: "Ouvrir la boîte de dialogue" });
  const status = page.getByTestId("dialog-state");
  await expect(status).toHaveText("État : fermé");
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Annuler cette commande ?" });
  await expect(dialog).toBeVisible();
  await expect(status).toHaveText("État : ouvert");
  await expect(dialog.getByRole("button", { name: "Non, garder" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(status).toHaveText("État : fermé");

  // A plain button of the form closes it too.
  await opener.click();
  await dialog.getByRole("button", { name: "Oui, annuler" }).click();
  await expect(dialog).toBeHidden();
  await expect(status).toHaveText("État : fermé");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("Dialog is clean with axe while open, in Arabic too", async ({ page }) => {
  for (const [locale, opener] of [
    ["fr", "Ouvrir la boîte de dialogue"],
    ["ar", "فتح مربع الحوار"],
  ] as const) {
    await page.goto(`/${locale}/dev/ui`);
    await page.getByRole("button", { name: opener }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((v) => v.id),
      locale,
    ).toEqual([]);
  }
});

test("stacked table: cards with a column label per cell at 360 px, a normal table at 1440 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/fr/dev/ui");
  const region = page.getByRole("region", { name: "Exemple de tableau empilé" });
  await region.scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
  const regionOverflow = await region.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(regionOverflow, "overflow inside the region").toBeLessThanOrEqual(0);
  const firstRow = region.locator("tbody tr").first();
  for (const label of ["Numéro", "Statut", "Montant"]) {
    await expect(firstRow.getByText(label, { exact: true }).first()).toBeVisible();
  }
  // The real headers stay in the DOM for assistive technology.
  await expect(region.getByRole("columnheader")).toHaveCount(3);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(firstRow.locator("td span[aria-hidden]").first()).toBeHidden();
});
