import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Screenshots for visual comparison with docs/ui/screenshots (test-results/ is git-ignored).
// The references are 1080 px wide, so every page also gets a 1080 px shot.
const SHOTS = path.join(process.cwd(), "test-results", "shots");

const PAGES = [
  { path: "", ref: "Main" },
  { path: "/services", ref: "W02-Services" },
  { path: "/commercants", ref: "W03-Commercants" },
  { path: "/suivi", ref: "W04-Suivi" },
  { path: "/zones", ref: "W05-Zones" },
  { path: "/aide", ref: "W06-Aide" },
  { path: "/contact", ref: "W07-Contact" },
  { path: "/livreur", ref: "W08-Livreur" },
  { path: "/legal/cgv", ref: "W09-Legal" },
  { path: "/page-inconnue", ref: "W10-Introuvable", status: 404 },
  { path: "/commander", ref: "coming-soon-commander" },
  { path: "/connexion", ref: "coming-soon-connexion" },
  { path: "/inscription", ref: "coming-soon-inscription" },
] as const;

const LOCALES = [
  { code: "fr", dir: "ltr" },
  { code: "ar", dir: "rtl" },
] as const;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 360, height: 800 },
] as const;

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const axe = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
  }));
};

const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

// ── Every page: lang, dir, no horizontal scroll, axe, screenshot ──────────────────────────────
for (const entry of PAGES) {
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      test(`${entry.ref} /${locale.code}${entry.path} at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const response = await page.goto(`/${locale.code}${entry.path}`);
        expect(response?.status()).toBe("status" in entry ? entry.status : 200);
        await page.evaluate(() => document.fonts.ready);

        const html = page.locator("html");
        await expect(html).toHaveAttribute("lang", locale.code);
        await expect(html).toHaveAttribute("dir", locale.dir);
        await expect(page.locator("h1")).toHaveCount(1);

        expect(await noOverflow(page), "horizontal overflow in px").toBeLessThanOrEqual(0);
        await shot(page, `${entry.ref}-${locale.code}-${viewport.width}`);
        expect(await axe(page), "axe violations").toEqual([]);
      });
    }
  }

  test(`${entry.ref} at 1080px (same width as docs/ui/screenshots)`, async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 900 });
    await page.goto(`/fr${entry.path}`);
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `${entry.ref}-fr-1080`);
    await page.goto(`/ar${entry.path}`);
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `${entry.ref}-ar-1080`);
  });
}

test("Main-EN: the home page in English", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 900 });
  await page.goto("/en");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await shot(page, "Main-en-1080");
  expect(await axe(page), "axe violations").toEqual([]);
});

// ── Header, footer, mobile menu ───────────────────────────────────────────────────────────────
test("the header buttons go to /commander and /connexion", async ({ page }) => {
  for (const code of ["fr", "ar", "en"]) {
    await page.goto(`/${code}`);
    const header = page.locator("header");
    await expect(header.locator('a[href$="/commander"]').first()).toHaveAttribute(
      "href",
      `/${code}/commander`,
    );
    await expect(header.locator('a[href$="/connexion"]').first()).toHaveAttribute(
      "href",
      `/${code}/connexion`,
    );
  }
  await page.goto("/fr");
  await page.locator("header").getByRole("link", { name: "Commander" }).click();
  await expect(page).toHaveURL(/\/fr\/commander$/);
  await expect(page.getByRole("heading", { name: "Commander" })).toBeVisible();
  await expect(page.getByText("Bientôt disponible")).toBeVisible();
});

test("the nav marks the current page and nothing on zones, contact, livreur or legal", async ({
  page,
}) => {
  const current = page
    .getByRole("navigation", { name: "Navigation principale" })
    .locator('[aria-current="page"]');
  await page.goto("/fr/aide");
  await expect(current).toHaveText("Aide");
  await page.goto("/fr");
  await expect(current).toHaveText("Accueil");
  for (const url of ["/fr/zones", "/fr/contact", "/fr/livreur", "/fr/legal/cgv"]) {
    await page.goto(url);
    await expect(current, url).toHaveCount(0);
  }
});

test("all five nav links are visible at 1080 px", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 900 });
  await page.goto("/fr");
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  for (const name of ["Accueil", "Services et tarifs", "Commerçants", "Suivre un colis", "Aide"]) {
    const box = await nav.getByRole("link", { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(1080);
  }
  // the last link ends before the language switcher starts: nothing overlaps
  const last = await nav.getByRole("link", { name: "Aide" }).boundingBox();
  const switcher = await page.locator("header").getByRole("group").boundingBox();
  expect(last!.x + last!.width).toBeLessThanOrEqual(switcher!.x);
});

test("the footer has three link columns and no Cookies link", async ({ page }) => {
  await page.goto("/fr");
  const footer = page.locator("footer");
  for (const name of ["Services", "Aide", "Légal"]) {
    await expect(footer.getByRole("heading", { name })).toBeVisible();
  }
  await expect(footer.locator('a[href$="/legal/cgv"]')).toBeVisible();
  await expect(footer.locator('a[href$="/legal/confidentialite"]')).toBeVisible();
  await expect(footer.locator('a[href$="/legal/mentions-legales"]')).toBeVisible();
  await expect(footer.getByRole("link", { name: /cookies/i })).toHaveCount(0);
  await expect(footer).toContainText("[TÉLÉPHONE] · [E-MAIL] · [ADRESSE]");
});

for (const code of ["fr", "ar"] as const) {
  test(`the mobile menu opens, shows links and closes with Escape (${code})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/${code}`);
    const toggle = page.locator("header").getByRole("button");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link")).toHaveCount(5 + 3 + 2); // 5 pages, 3 languages, 2 buttons
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axe(page), "axe violations").toEqual([]);
    await shot(page, `mobile-menu-${code}-360`);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });
}

// ── Tracking (W04, SUI-01) ────────────────────────────────────────────────────────────────────
test("tracking: a found parcel shows status, ETA, history and no personal data", async ({
  page,
}) => {
  await page.goto("/fr/suivi");
  await page.getByLabel("Numéro de suivi").fill(" fg-7k4m-2qxp ");
  await page.getByRole("button", { name: "Suivre" }).click();
  await expect(page.getByText("Arrivée estimée")).toBeVisible();
  const main = page.locator("main");
  await expect(main).toContainText(/14\u00a0h\u00a020/);
  await expect(main.getByText("En cours de livraison").first()).toBeVisible();
  await expect(main).toContainText("Commande créée");
  await expect(main).toContainText("[VILLE DE DÉPART]");
  await expect(main).toContainText("[VILLE D'ARRIVÉE]");
  for (const secret of ["Sami", "Yasmine", "48,500", "4827"]) {
    await expect(main, secret).not.toContainText(secret);
  }
  expect(await axe(page), "axe violations").toEqual([]);
  await shot(page, "W04-Suivi-found-fr-1440");
});

test("tracking: unknown number and invalid format", async ({ page }) => {
  await page.goto("/fr/suivi");
  const field = page.getByLabel("Numéro de suivi");
  await field.fill("FG-0000-0000");
  await page.getByRole("button", { name: "Suivre" }).click();
  await expect(page.getByText("Numéro introuvable")).toBeVisible();

  await field.fill("12345");
  await page.getByRole("button", { name: "Suivre" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("ressemble à FG-7K4M-2QXP");
  await expect(page.getByText("Numéro introuvable")).toHaveCount(0);
});

test("tracking: /suivi?n=FG-7K4M-2QXP looks the parcel up on load, in every language", async ({
  page,
}) => {
  for (const [code, text] of [
    ["fr", "En cours de livraison"],
    ["en", "Out for delivery"],
    ["ar", "قيد التوصيل"],
  ] as const) {
    await page.goto(`/${code}/suivi?n=FG-7K4M-2QXP`);
    await expect(page.locator("main").getByText(text).first()).toBeVisible();
  }
});

test("home: the tracking field opens /suivi?n= and refuses a bad number", async ({ page }) => {
  await page.goto("/fr");
  const field = page.getByLabel("Déjà un numéro de suivi ?");
  await field.fill("abc");
  await page.getByRole("button", { name: "Suivre" }).click();
  await expect(page.getByText("ressemble à FG-7K4M-2QXP")).toBeVisible();
  await expect(page).toHaveURL(/\/fr$/);

  await field.fill("fg-7k4m-2qxp");
  await page.getByRole("button", { name: "Suivre" }).click();
  await expect(page).toHaveURL(/\/fr\/suivi\?n=FG-7K4M-2QXP$/);
  await expect(page.getByText("Arrivée estimée")).toBeVisible();
});

test("home: Voir le prix goes to /commander", async ({ page }) => {
  await page.goto("/fr");
  await page.getByRole("button", { name: "Voir le prix" }).click();
  await expect(page).toHaveURL(/\/fr\/commander/);
});

// ── Zone check (W05, FE-04) ───────────────────────────────────────────────────────────────────
test("zones: in zone, out of zone, unknown address, too short", async ({ page }) => {
  await page.goto("/fr/zones");
  const field = page.getByLabel("Votre adresse");
  const submit = page.getByRole("button", { name: "Vérifier" });

  await field.fill("Rue Ibn Khaldoun");
  await submit.click();
  await expect(page.getByText("Cette adresse est desservie.")).toBeVisible();
  await expect(page.getByText("Services disponibles : Express et Standard.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Commander" }).last()).toHaveAttribute(
    "href",
    "/fr/commander",
  );

  await field.fill("Route de Sousse, km 40");
  await submit.click();
  await expect(page.getByText("Nous n'y livrons pas encore.")).toBeVisible();
  await expect(page.getByText("Cette adresse est desservie.")).toHaveCount(0);

  await field.fill("12 rue des Orangers");
  await submit.click();
  await expect(page.getByText("Adresse non reconnue.")).toBeVisible();

  await field.fill("ab");
  await submit.click();
  await expect(page.getByText("Saisissez au moins 3 caractères.")).toBeVisible();
});

test("zones: Lancement à [VILLE] stays visible and there is no city list or map", async ({
  page,
}) => {
  await page.goto("/fr/zones");
  await expect(page.getByText("Lancement à [VILLE].")).toBeVisible();
  await expect(page.locator("main svg[role=img]")).toHaveCount(0);
});

// ── Contact (W07, FE-06) ──────────────────────────────────────────────────────────────────────
async function fillContact(page: Page) {
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill("Test Client");
  await page.getByRole("textbox", { name: "Téléphone", exact: true }).fill("+216 20 000 000");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("client@example.com");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Bonjour, ceci est un test.");
}

const tickCaptcha = async (page: Page) => {
  const box = page.getByLabel("Je ne suis pas un robot");
  // The mock asks for a token first, so the box ticks a moment after the click.
  await box.click();
  await expect(box).toBeChecked();
};

test("contact: the ticket is opened once the captcha is ticked", async ({ page }) => {
  await page.goto("/fr/contact");
  await fillContact(page);
  await tickCaptcha(page);
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText("Votre demande est enregistrée.")).toBeVisible();
  await expect(page.getByText("TK-20481")).toBeVisible();
  await expect(page.getByText("accusé de réception")).toBeVisible();
  expect(await axe(page), "axe violations").toEqual([]);
  await shot(page, "W07-Contact-confirmation-fr-1440");
});

test("contact: refuses to send without the captcha, and shows field errors", async ({ page }) => {
  await page.goto("/fr/contact");
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText("Ce champ est obligatoire.").first()).toBeVisible();
  await expect(page.getByText("Confirmez que vous n'êtes pas un robot.")).toBeVisible();
  await expect(page.getByText("Votre demande est enregistrée.")).toHaveCount(0);
});

test("contact: an empty tracking number is valid, a wrong one is not", async ({ page }) => {
  await page.goto("/fr/contact");
  await fillContact(page);
  await tickCaptcha(page);
  await page.getByLabel("Numéro de suivi (facultatif)").fill("FG-12");
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText("ressemble à FG-7K4M-2QXP")).toBeVisible();
  await page.getByLabel("Numéro de suivi (facultatif)").fill("fg-7k4m-2qxp");
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText("Votre demande est enregistrée.")).toBeVisible();
});

test("contact: an attachment of exactly 5 MB is accepted, one byte more is refused", async ({
  page,
}) => {
  const FIVE_MB = 5 * 1024 * 1024;
  await page.goto("/fr/contact");
  const input = page.locator('input[type="file"]');

  await input.setInputFiles({
    name: "exact.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(FIVE_MB),
  });
  await expect(page.getByText("exact.pdf")).toBeVisible();
  await expect(page.getByText("Le fichier dépasse 5 Mo.")).toHaveCount(0);

  await page.getByRole("button", { name: "Retirer la pièce jointe" }).click();
  await input.setInputFiles({
    name: "over.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(FIVE_MB + 1),
  });
  await expect(page.getByText("Le fichier dépasse 5 Mo.")).toBeVisible();

  // and the form does not send while the file is too large
  await fillContact(page);
  await tickCaptcha(page);
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText("Votre demande est enregistrée.")).toHaveCount(0);
  await expect(page.getByText("Le fichier dépasse 5 Mo.")).toBeVisible();
});

test("contact: ?type=devis preselects Devis; the three request types exist", async ({ page }) => {
  await page.goto("/fr/contact?type=devis");
  const select = page.getByLabel("Votre demande");
  await expect(select).toHaveValue("quote");
  await expect(select.locator("option")).toHaveText(["Question", "Devis", "Réclamation"]);
  await page.goto("/fr/contact");
  await expect(select).toHaveValue("question");
});

test("merchants: Demander un devis scrolls to the section and the button leads to /contact?type=devis", async ({
  page,
}) => {
  await page.goto("/fr/commercants");
  await expect(page.getByRole("link", { name: "Demander un devis" })).toHaveAttribute(
    "href",
    "#devis",
  );
  await expect(page.locator("#devis")).toContainText("Parlons de vos volumes");
  await expect(page.getByRole("link", { name: "Recevoir ma proposition" })).toHaveAttribute(
    "href",
    "/fr/contact?type=devis",
  );
  await expect(page.getByRole("link", { name: "Créer un compte" })).toHaveAttribute(
    "href",
    "/fr/inscription",
  );
  await expect(page.getByText("Bientôt disponibles")).toBeVisible();
  await expect(page.locator("main form")).toHaveCount(0);
});

// ── Driver (W08) ──────────────────────────────────────────────────────────────────────────────
test("driver: heading, validation, 5 MB rule and confirmation", async ({ page }) => {
  await page.goto("/fr/livreur");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Livrez avec FastGo.");
  await expect(page.locator("main")).not.toContainText("gains visibles");

  await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await expect(page.getByText("Ce champ est obligatoire.").first()).toBeVisible();

  const FIVE_MB = 5 * 1024 * 1024;
  await page.locator('input[type="file"]').setInputFiles({
    name: "over.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(FIVE_MB + 1),
  });
  await expect(page.getByText("Le fichier dépasse 5 Mo.")).toBeVisible();
  await page.getByRole("button", { name: "Retirer le document" }).click();

  await page.getByRole("textbox", { name: "Nom complet" }).fill("Test Livreur");
  await page.getByRole("textbox", { name: "Téléphone", exact: true }).fill("20 000 000");
  await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await expect(page.getByText("Candidature envoyée.")).toBeVisible();
});

// ── Help, legal, services ─────────────────────────────────────────────────────────────────────
test("help: topics filter the questions, search finds across topics, unanswered show [RÉPONSE]", async ({
  page,
}) => {
  await page.goto("/fr/aide");
  await expect(page.getByText("garanti 15 minutes")).toBeVisible();
  await expect(page.getByText("10 minutes")).toHaveCount(0);
  await expect(page.getByText("Puis-je annuler ma commande ?")).toBeVisible();

  await page.getByRole("button", { name: "Suivi et livraison" }).click();
  await expect(page.getByText("À quoi sert le code de remise ?")).toBeVisible();
  await expect(page.getByText("Puis-je annuler ma commande ?")).toHaveCount(0);

  await page.getByLabel("Rechercher dans l'aide").fill("facture");
  await expect(page.getByText("Comment obtenir ma facture ?")).toBeVisible();
  await page.getByLabel("Rechercher dans l'aide").fill("zzzz");
  await expect(page.getByText("Aucune question ne correspond à votre recherche.")).toBeVisible();
});

test("legal: four documents with [TEXTE], unknown document is a 404, /legal opens the CGV", async ({
  page,
}) => {
  await page.goto("/fr/legal/confidentialite");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Politique de confidentialité");
  await expect(page.getByText("[TEXTE]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Confidentialité" }).first()).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goto("/fr/legal/cgv");
  await expect(page.getByText("[TEXTE]")).toHaveCount(4);

  const missing = await page.goto("/fr/legal/nope");
  expect(missing?.status()).toBe(404);

  await page.goto("/fr/legal");
  await expect(page).toHaveURL(/\/fr\/legal\/cgv$/);
});

test("services: no simulator, placeholders for prices, hours, limits and fees", async ({
  page,
}) => {
  await page.goto("/fr/services");
  const main = page.locator("main");
  await expect(main.getByText("[PRIX] TND")).toHaveCount(3);
  await expect(main.getByText("[HEURE]")).toHaveCount(3);
  await expect(main.getByText("[LIMITE]")).toHaveCount(4);
  await expect(main.getByText("[TARIF]")).toHaveCount(4);
  await expect(main).toContainText("[LISTE À VALIDER PAR FASTGO]");
  await expect(main).not.toContainText("La veille");
  await expect(main).not.toContainText("Estimer un prix");
  await expect(main).not.toContainText("11,305");
});

// ── Placeholders in the three languages, time format ──────────────────────────────────────────
test("placeholders render in fr, ar and en", async ({ page }) => {
  const expected = {
    fr: ["[PRIX] TND", "[VILLE]", "[TÉLÉPHONE]"],
    en: ["[PRICE] TND", "[CITY]", "[PHONE]"],
    ar: ["[السعر] د.ت", "[المدينة]", "[الهاتف]"],
  } as const;
  for (const [code, texts] of Object.entries(expected)) {
    await page.goto(`/${code}`);
    for (const text of texts) {
      await expect(page.locator("body"), `${code} ${text}`).toContainText(text);
    }
  }
});

test("the time shows 14 h 20 in French and 14:20 in English and Arabic", async ({ page }) => {
  await page.goto("/fr");
  await expect(page.locator("main").first()).toContainText(/14\u00a0h\u00a020/);
  for (const code of ["en", "ar"]) {
    await page.goto(`/${code}`);
    await expect(page.locator("main")).toContainText("14:20");
  }
});

// ── Metadata ──────────────────────────────────────────────────────────────────────────────────
for (const entry of PAGES.filter((item) => !("status" in item))) {
  test(`metadata: title, description and hreflang on ${entry.ref}`, async ({ page }) => {
    for (const code of ["fr", "ar", "en"]) {
      await page.goto(`/${code}${entry.path}`);
      await expect(page).toHaveTitle(/FastGo/);
      expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();

      const links = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((nodes) =>
          nodes.map((node) => [node.getAttribute("hreflang"), node.getAttribute("href")]),
        );
      const byLang = Object.fromEntries(links);
      expect(Object.keys(byLang).sort()).toEqual(["ar", "en", "fr", "x-default"]);
      expect(byLang.fr).toMatch(new RegExp(`/fr${entry.path}$`));
      expect(byLang.ar).toMatch(new RegExp(`/ar${entry.path}$`));
      expect(byLang.en).toMatch(new RegExp(`/en${entry.path}$`));
      expect(byLang["x-default"]).toMatch(new RegExp(`/fr${entry.path}$`));
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical).toMatch(new RegExp(`/${code}${entry.path}$`));
    }
  });
}

test("coming-soon pages are noindex, real pages are not", async ({ page }) => {
  for (const url of ["/fr/commander", "/fr/connexion", "/fr/inscription"]) {
    await page.goto(url);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
  await page.goto("/fr/services");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("no sitemap, no structured data, no analytics, no cookie banner", async ({
  page,
  request,
}) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(404);
  await page.goto("/fr");
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/cookies?/i)).toHaveCount(0);
});
