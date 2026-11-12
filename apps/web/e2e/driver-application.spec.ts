import { expect, test, type Page } from "@playwright/test";
import { axe, noOverflow, shot, VIEWPORTS } from "./helpers";

// FE-05, W08-Livreur: the driver application form (GOFAST's vehicles and six documents).
const FIVE_MB = 5 * 1024 * 1024;

const COPY = {
  fr: {
    submit: "Envoyer ma candidature",
    sent: "Candidature envoyée.",
    required: "Ajoutez ce document.",
    badType: "Seuls les images et les PDF sont acceptés.",
    tooLarge: "Le fichier dépasse 5 Mo.",
    vehicles: ["Scooter", "Moto", "Voiture", "Utilitaire léger"],
    vehicleLabel: "Véhicule",
    cin: "Carte d'identité nationale (CIN)",
    requiredWord: "obligatoire",
    remove: /^Retirer le fichier/,
  },
  ar: {
    submit: "إرسال ترشحي",
    sent: "تم إرسال الترشح.",
    required: "أضف هذه الوثيقة.",
    badType: "تُقبل الصور وملفات PDF فقط.",
    tooLarge: "حجم الملف يتجاوز 5 ميغابايت.",
    vehicles: ["سكوتر", "دراجة نارية", "سيارة", "مركبة نفعية خفيفة"],
    vehicleLabel: "المركبة",
    cin: "بطاقة التعريف الوطنية",
    requiredWord: "مطلوب",
    remove: /^إزالة الملف/,
  },
  en: {
    submit: "Send my application",
    sent: "Application sent.",
    required: "Add this document.",
    badType: "Only images and PDF files are accepted.",
    tooLarge: "The file is larger than 5 MB.",
    vehicles: ["Scooter", "Motorbike", "Car", "Light van"],
    vehicleLabel: "Vehicle",
    cin: "National ID card (CIN)",
    requiredWord: "required",
    remove: /^Remove the file/,
  },
} as const;

const pdf = (name = "doc.pdf", size = 1000) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.alloc(size),
});

const files = (page: Page) => page.locator('main input[type="file"]');
const submit = (page: Page) => page.locator("main form button[type=submit]");
const alerts = (page: Page) => page.locator("main form [role=alert]");

test("driver: the vehicles are GOFAST's four, in every language, with no placeholder", async ({
  page,
}) => {
  for (const code of ["fr", "en", "ar"] as const) {
    await page.goto(`/${code}/livreur`);
    await expect(page.getByLabel(COPY[code].vehicleLabel).locator("option")).toHaveText([
      ...COPY[code].vehicles,
    ]);
    await expect(page.locator("main")).not.toContainText(/\[VÉHICULE\]|\[VEHICLE\]/);
  }
});

for (const code of ["fr", "ar"] as const) {
  for (const viewport of VIEWPORTS) {
    test(`driver: fill and submit in ${code} at ${viewport.width}px (FE-05)`, async ({ page }) => {
      const copy = COPY[code];
      await page.setViewportSize(viewport);
      await page.goto(`/${code}/livreur`);
      await expect(files(page)).toHaveCount(6);
      // RV-16: the required state is heard, from the accessibility tree, not only seen as a star.
      await expect(page.getByRole("group", { name: copy.requiredWord })).toHaveCount(6);

      // A missing document shows its error and takes the focus (the text fields are filled).
      await page.locator('input[autocomplete="name"]').fill("Test Livreur");
      await page.locator("input[type=tel]").fill("20 000 000");
      await submit(page).click();
      await expect(alerts(page).filter({ hasText: copy.required })).toHaveCount(6);
      await expect(page.getByRole("group", { name: copy.cin }).getByRole("button")).toBeFocused();
      expect(await noOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axe(page)).toEqual([]);

      // Wrong type and oversize are refused in the form, on the right document.
      await files(page)
        .nth(0)
        .setInputFiles({ name: "a.zip", mimeType: "application/zip", buffer: Buffer.alloc(10) });
      await expect(alerts(page).filter({ hasText: copy.badType })).toHaveCount(1);
      await files(page)
        .nth(1)
        .setInputFiles(pdf("big.pdf", FIVE_MB + 1));
      await expect(alerts(page).filter({ hasText: copy.tooLarge })).toHaveCount(1);
      expect(await axe(page)).toEqual([]);
      await page.getByRole("button", { name: copy.remove }).first().click();
      await page.getByRole("button", { name: copy.remove }).first().click();

      // Exactly 5 MB is accepted; with all six documents the form is sent.
      await files(page).nth(0).setInputFiles(pdf("cin.pdf", FIVE_MB));
      for (const index of [1, 2, 3, 4, 5]) await files(page).nth(index).setInputFiles(pdf());
      await expect(alerts(page).filter({ hasText: /\S/ })).toHaveCount(0);
      expect(await axe(page)).toEqual([]);
      await shot(page, `livreur-${code}-${viewport.width}-filled`);

      await submit(page).click();
      await expect(page.getByText(copy.sent)).toBeVisible();
      const confirmation = page.locator('div[tabindex="-1"]', { hasText: copy.sent });
      await expect(confirmation).toBeFocused();
      expect(await noOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axe(page)).toEqual([]);
      await shot(page, `livreur-${code}-${viewport.width}-sent`);
    });
  }
}

test("driver: nothing of the application reaches the URL or localStorage", async ({ page }) => {
  await page.goto("/fr/livreur");
  await page.locator('input[autocomplete="name"]').fill("Test Livreur");
  await page.locator("input[type=tel]").fill("20 000 000");
  for (let index = 0; index < 6; index++) await files(page).nth(index).setInputFiles(pdf());
  await submit(page).click();
  await expect(page.getByText(COPY.fr.sent)).toBeVisible();
  expect(page.url()).toMatch(/\/fr\/livreur$/);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toMatch(/doc\.pdf|Test Livreur|20 000 000|20000000/);
});

test("driver: heading, required text fields, and a focused confirmation (W08)", async ({
  page,
}) => {
  await page.goto("/fr/livreur");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Livrez avec GOFAST.");
  await expect(page.locator("main")).not.toContainText("gains visibles");

  await submit(page).click();
  await expect(alerts(page).filter({ hasText: "Ce champ est obligatoire." })).toHaveCount(0);
  await expect(page.getByText("Ce champ est obligatoire.")).toHaveCount(2);
  await expect(page.locator('input[autocomplete="name"]')).toBeFocused();

  await page.locator('input[autocomplete="name"]').fill("Test Livreur");
  await page.locator("input[type=tel]").fill("20 000 000");
  for (let index = 0; index < 6; index++) await files(page).nth(index).setInputFiles(pdf());
  await submit(page).click();
  const confirmation = page.locator('div[tabindex="-1"]', { hasText: COPY.fr.sent });
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toHaveCSS("outline-style", "solid");
});
