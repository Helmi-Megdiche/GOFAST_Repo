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
  // The order flow, sign-in and account pages are covered by order-flow.spec.ts, auth.spec.ts and account.spec.ts.
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
  // /commander opens the first step of the order (W11).
  await expect(page).toHaveURL(/\/fr\/commander\/expediteur$/);
  await expect(page.getByRole("heading", { level: 1, name: "D'où part le colis ?" })).toBeVisible();
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

// The header collapses into the burger menu below 1100 px (the French nav does not fit in 900-1099 px,
// even compact). From 1200 px it has the mockup sizes: logo 42 px, buttons 44 px high.
const NAV_LABEL = {
  fr: "Navigation principale",
  en: "Main navigation",
  ar: "التنقل الرئيسي",
} as const;
for (const code of ["fr", "ar", "en"] as const) {
  for (const width of [900, 1000, 1100, 1200, 1440]) {
    test(`header: one row, no overlap, no overflow at ${width}px (${code})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${code}`);
      expect(await noOverflow(page), "horizontal overflow in px").toBeLessThanOrEqual(0);

      const info = await page.evaluate(() => {
        const header = document.querySelector("header")!;
        const items = [...header.querySelectorAll("a, button, [role=group]")]
          .filter((el) => !el.parentElement!.closest("[role=group]"))
          .map((el) => {
            const box = el.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, height: box.height };
          })
          .filter((box) => box.right - box.left > 0);
        const logo = header.querySelector("img")!.getBoundingClientRect().height;
        const buttons = [...header.querySelectorAll('a[href$="/connexion"], a[href$="/commander"]')]
          .map((el) => el.getBoundingClientRect().height)
          .filter((height) => height > 0);
        return { height: header.getBoundingClientRect().height, items, logo, buttons };
      });

      expect(info.height, "a second row would make the header taller than 100 px").toBeLessThan(
        100,
      );
      const sorted = [...info.items].sort((x, y) => x.left - y.left);
      for (const [index, box] of sorted.entries()) {
        expect(box.left, "inside the window").toBeGreaterThanOrEqual(0);
        expect(box.right, "inside the window").toBeLessThanOrEqual(width);
        if (index > 0) {
          expect(box.left, "no overlap").toBeGreaterThanOrEqual(sorted[index - 1]!.right - 0.5);
        }
      }
      const centres = info.items.map((box) => box.top + box.height / 2);
      expect(Math.max(...centres) - Math.min(...centres), "one row").toBeLessThan(6);

      const nav = page.getByRole("navigation", { name: NAV_LABEL[code] });
      if (width < 1100) {
        await expect(page.locator("header").getByRole("button")).toBeVisible();
        await expect(nav).toBeHidden();
      } else {
        await expect(page.locator("header").getByRole("button")).toBeHidden();
        await expect(nav.getByRole("link")).toHaveCount(5);
        expect(info.buttons).toHaveLength(2);
        expect(Math.round(info.logo)).toBe(width >= 1200 ? 42 : 32);
        for (const height of info.buttons) expect(Math.round(height)).toBe(width >= 1200 ? 44 : 36);
      }
    });
  }
}

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
  await expect(main.getByText("Votre livraison est en cours")).toBeVisible();
  await expect(main.getByText("En route").first()).toBeVisible();
  await expect(main).toContainText("Confirmée");
  await expect(main).toContainText("[VILLE DE DÉPART]");
  await expect(main).toContainText("[VILLE D'ARRIVÉE]");
  for (const secret of ["Sami", "Nadia", "Yasmine", "98000001", "48,500", "4827"]) {
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
    ["fr", "Votre livraison est en cours"],
    ["en", "Your delivery is on its way"],
    ["ar", "طلبك قيد التوصيل"],
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

test("home: Voir le prix carries the addresses through the draft, with nothing in the URL", async ({
  page,
}) => {
  await page.goto("/fr");
  await page.getByLabel("Départ").fill("Avenue Habib Bourguiba");
  await page.getByLabel("Arrivée").fill("Rue Ibn Khaldoun");
  await page.getByRole("button", { name: "Voir le prix" }).click();
  await expect(page).toHaveURL(/\/fr\/commander\/expediteur$/);
  expect(page.url()).not.toContain("?");
  expect(decodeURIComponent(page.url())).not.toMatch(/Bourguiba|Khaldoun/);
  // The typed address is in the draft, not yet confirmed: a suggestion or the pin is still needed.
  await expect(page.getByRole("textbox", { name: "Adresse de collecte", exact: true })).toHaveValue(
    "Avenue Habib Bourguiba",
  );
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fg.order.draft.v1") ?? "null"),
  );
  expect(draft.sender.address).toMatchObject({ text: "Avenue Habib Bourguiba", confirmed: false });
  expect(draft.recipient.address).toMatchObject({ text: "Rue Ibn Khaldoun", confirmed: false });
});

// ── Zone check (W05, FE-04) ───────────────────────────────────────────────────────────────────
test("zones: in zone, out of zone, unknown address, too short", async ({ page }) => {
  await page.goto("/fr/zones");
  const field = page.getByLabel("Votre adresse");
  const submit = page.getByRole("button", { name: "Vérifier" });

  // The W05 mockup's answer, "Express et Standard", is the two-service fixture address. The
  // addresses of the order mockups offer the three services of W14 (lib/data/zones.ts).
  await field.fill("Rue de Marseille");
  await submit.click();
  await expect(page.getByText("Cette adresse est desservie.")).toBeVisible();
  await expect(page.getByText("Services disponibles : Express et Standard.")).toBeVisible();

  await field.fill("Rue Ibn Khaldoun");
  await submit.click();
  await expect(
    page.getByText("Services disponibles : Express, Standard et Programmée."),
  ).toBeVisible();
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
  await expect(main).toContainText("[LISTE À VALIDER PAR GOFAST]");
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
      await expect(page).toHaveTitle(/GOFAST/);
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

test("order, sign-in and coming-soon pages are noindex, public pages are not", async ({ page }) => {
  for (const url of [
    "/fr/commander",
    "/fr/commander/expediteur",
    "/fr/commander/destinataire",
    "/fr/commander/colis",
    "/fr/commander/service",
    "/fr/commander/verification",
    "/fr/commander/code",
    "/fr/commander/confirmation",
    "/fr/commander/hors-zone",
    "/fr/connexion",
    "/fr/inscription",
    "/fr/code",
    "/fr/mot-de-passe",
    "/fr/mot-de-passe/nouveau",
    "/fr/google-telephone",
    "/fr/compte",
    "/fr/pro",
  ]) {
    await page.goto(url);
    // A client redirect (e.g. /commander to its first step) can briefly leave the old page's tag
    // next to the new one: every robots tag present must say noindex.
    const robots = page.locator('meta[name="robots"]');
    await expect(robots.first()).toHaveAttribute("content", /noindex/);
    for (const content of await robots.evaluateAll((tags) =>
      tags.map((tag) => tag.getAttribute("content")),
    )) {
      expect(content, url).toMatch(/noindex/);
    }
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

// ── Fixes after the review of PR #4 ───────────────────────────────────────────────────────────
test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("/fr/suivi has its h1 and its form", async ({ page }) => {
    await page.goto("/fr/suivi");
    await expect(page.getByRole("heading", { level: 1, name: "Suivre un colis" })).toBeVisible();
    await expect(page.getByLabel("Numéro de suivi")).toBeVisible();
    await expect(page.getByRole("button", { name: "Suivre" })).toBeVisible();
  });

  test("/fr/contact has its form", async ({ page }) => {
    await page.goto("/fr/contact");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer ma demande" })).toBeVisible();
  });

  test("forms that take personal data post, so nothing reaches the URL", async ({ page }) => {
    for (const url of ["/fr/contact", "/fr/livreur", "/fr/zones"]) {
      await page.goto(url);
      const methods = await page
        .locator("main form")
        .evaluateAll((forms) => forms.map((form) => (form as HTMLFormElement).method));
      expect(methods.length, url).toBeGreaterThan(0);
      for (const method of methods) expect(method, url).toBe("post");
    }
    await page.goto("/fr");
    // The home inputs have names now (decision 3), and the form posts: never a GET with addresses.
    const quote = page.locator("main form").first();
    expect(await quote.evaluate((form) => (form as HTMLFormElement).method)).toBe("post");
    expect(await quote.locator("input[name]").count()).toBe(2);
  });
});

test("tracking: a search puts the code in the URL and the field follows it", async ({ page }) => {
  await page.goto("/fr/suivi");
  await page.getByLabel("Numéro de suivi").fill(" fg-7k4m-2qxp ");
  await page.getByRole("button", { name: "Suivre" }).click();
  await expect(page).toHaveURL(/\/fr\/suivi\?n=FG-7K4M-2QXP$/);
  await expect(page.getByText("Arrivée estimée")).toBeVisible();
  await expect(page.getByLabel("Numéro de suivi")).toHaveValue("FG-7K4M-2QXP");
});

test("tracking: the Suivre button keeps the focus while searching", async ({ page }) => {
  await page.goto("/fr/suivi");
  await page.getByLabel("Numéro de suivi").fill("FG-7K4M-2QXP");
  const button = page.getByRole("button", { name: /Suivre|Recherche/ });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toBeFocused();
  await expect(page.getByText("Arrivée estimée")).toBeVisible();
  await expect(button).toBeFocused();
});

test("tracking: a badly formed number does not change the URL", async ({ page }) => {
  await page.goto("/fr/suivi?n=FG-7K4M-2QXP");
  await expect(page.getByText("Arrivée estimée")).toBeVisible();
  await page.getByLabel("Numéro de suivi").fill("abc");
  await page.getByRole("button", { name: "Suivre" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("ressemble à FG-7K4M-2QXP");
  await expect(page).toHaveURL(/\/fr\/suivi\?n=FG-7K4M-2QXP$/);
  await expect(page.getByText("Arrivée estimée")).toHaveCount(0);
});

test("tracking: /suivi?n=fg-7k4m-2qxp shows the uppercase code", async ({ page }) => {
  await page.goto("/fr/suivi?n=fg-7k4m-2qxp");
  await expect(page.getByLabel("Numéro de suivi")).toHaveValue("FG-7K4M-2QXP");
  await expect(page.getByText("Arrivée estimée")).toBeVisible();
});

test("tracking: the nav link Suivre un colis clears the result and the field", async ({ page }) => {
  await page.goto("/fr/suivi?n=FG-7K4M-2QXP");
  await expect(page.getByText("Arrivée estimée")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Suivre un colis" })
    .click();
  await expect(page).toHaveURL(/\/fr\/suivi$/);
  await expect(page.getByText("Arrivée estimée")).toHaveCount(0);
  await expect(page.getByLabel("Numéro de suivi")).toHaveValue("");
  await expect(page.getByText("Où est votre colis ?")).toBeVisible();
});

test("tracking: an outcome order shows its client wording and the detail per parcel", async ({
  page,
}) => {
  // FG-5A1Y-0011 is the T19 fixture: 2 parcels handed over, 1 returned.
  for (const [lang, wording, handed, line] of [
    ["fr", "Issue de la livraison : Livrée en partie", "Remis", "Colis 1 : Remis"],
    ["en", "Delivery outcome: Partially delivered", "Handed over", "Parcel 1: Handed over"],
    ["ar", "نتيجة التوصيل: تم التسليم جزئيًا", "تم التسليم", "الطرد 1: تم التسليم"],
  ] as const) {
    await page.goto(`/${lang}/suivi?n=FG-5A1Y-0011`);
    const main = page.locator("main");
    await expect(main.getByText(wording)).toBeVisible();
    await expect(main.getByText(handed, { exact: false }).first()).toBeVisible();
    await expect(main.locator("ul li")).toHaveCount(3);
    // the punctuation belongs to the language: no French " :" in en or ar
    await expect(main.locator("ul li").first()).toHaveText(line);
    for (const secret of ["Omar", "Sami", "98000001", "20000012", "Sousse"]) {
      await expect(main, secret).not.toContainText(secret);
    }
    expect(await axe(page), `axe ${lang}`).toEqual([]);
  }
});

test("contact: the captcha keeps the keyboard focus while it checks", async ({ page }) => {
  await page.goto("/fr/contact");
  const box = page.getByLabel("Je ne suis pas un robot");
  await box.focus();
  await page.keyboard.press("Space");
  // right after the key press, while the mock token is requested: still focused, never disabled
  await expect(box).toBeFocused();
  await expect(box).toBeEnabled();
  await expect(box).toBeChecked();
  await expect(box).toBeFocused();
  await expect(box).toBeEnabled();
  // the keyboard still works: Space again unticks it
  await page.keyboard.press("Space");
  await expect(box).not.toBeChecked();
  await expect(box).toBeFocused();
});

test("contact: after sending, the focus is on the confirmation", async ({ page }) => {
  await page.goto("/fr/contact");
  await fillContact(page);
  await tickCaptcha(page);
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  const confirmation = page.locator('div[tabindex="-1"]', {
    hasText: "Votre demande est enregistrée.",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toHaveCSS("outline-style", "solid");
  await expect(confirmation).toHaveCSS("outline-width", "2px");
});

test("contact: ?type= with an unknown value or an Object.prototype name means Question", async ({
  page,
}) => {
  for (const value of ["constructor", "__proto__", "toString", "nope"]) {
    await page.goto(`/fr/contact?type=${value}`);
    await expect(page.getByLabel("Votre demande")).toHaveValue("question");
  }
  await page.goto("/fr/contact?type=RECLAMATION");
  await expect(page.getByLabel("Votre demande")).toHaveValue("claim");
});
