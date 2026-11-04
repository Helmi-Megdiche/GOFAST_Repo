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
