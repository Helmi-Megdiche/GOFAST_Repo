import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Shared by order-flow.spec.ts and auth.spec.ts (same checks as public-site.spec.ts). */
export const SHOTS = path.join(process.cwd(), "test-results", "shots");

export const LOCALES = [
  { code: "fr", dir: "ltr" },
  { code: "ar", dir: "rtl" },
] as const;

export const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 360, height: 800 },
] as const;

export const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export const axe = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
  }));
};

export const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

/** lang, dir, one h1, no horizontal scroll, screenshot, axe. */
export async function checkPage(page: Page, locale: (typeof LOCALES)[number], name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("html")).toHaveAttribute("lang", locale.code);
  await expect(page.locator("html")).toHaveAttribute("dir", locale.dir);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await noOverflow(page), "horizontal overflow in px").toBeLessThanOrEqual(0);
  await shot(page, name);
  expect(await axe(page), "axe violations").toEqual([]);
}

/** 4 November 2026, 09:30 in Tunis: every example pickup slot from 11:00 is still ahead. */
export const MORNING = new Date("2026-11-04T08:30:00Z");

/** Fixture code of the mock (lib/data/fixtures/accounts.ts): the first code sent to a phone. */
export const FIRST_CODE = "482615";
export const SECOND_CODE = "731904";

/**
 * goto, then wait until React has attached to the first form of `main` (RV-10). A click before
 * that submits the form natively (a full POST), so the sign-in or sign-up never happens.
 * `networkidle` is only a proxy for this; the form's own React props are the signal.
 */
export async function openForm(page: Page, url: string) {
  await page.goto(url);
  await formHydrated(page);
}

/** Wait for React on the first form of `main`, after a goto or a client-side navigation. */
export async function formHydrated(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("main form");
    return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
  });
}
