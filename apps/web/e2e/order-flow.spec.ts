import { expect, test, type Page } from "@playwright/test";
import { FIRST_CODE, LOCALES, MORNING, VIEWPORTS, checkPage, shot } from "./helpers";
import {
  SENDER_PHONE,
  chooseStandard,
  fillParcel,
  fillRecipient,
  fillSender,
  payAndAccept,
  start,
  textbox,
  toReview,
} from "./flow";

/**
 * Order flow (W11 to W17, CMD-01 to CMD-07) on mock data. Fake names and phones only.
 * The mock "server" lives in this browser's localStorage, so every test starts empty.
 */

const KNOWN_PHONE = "+216 98 000 001"; // fixture account Sami T. (lib/data/fixtures/accounts.ts)
const PASSWORD = "fastgo-demo-2026"; // fixture password, mock only

const orders = (page: Page) =>
  page.evaluate(
    () => Object.keys(JSON.parse(localStorage.getItem("fg.mock.orders") ?? "{}")).length,
  );
const draft = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("fg.order.draft.v1") ?? "null"));

async function signInAs(page: Page, phone: string) {
  await page.goto("/fr/connexion");
  await page.getByRole("textbox", { name: "Téléphone ou e-mail" }).fill(phone);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  // No ?next=: a customer lands on /compte, a merchant on /pro (homeFor).
  await expect(page).toHaveURL(/\/fr\/(compte|pro)$/);
}

async function placeGuestOrder(page: Page) {
  await start(page);
  await toReview(page);
  await payAndAccept(page);
  await page.getByRole("button", { name: "Valider la commande" }).click();
  await expect(page).toHaveURL(/\/commander\/code$/);
  await page.getByRole("textbox", { name: "Code à 6 chiffres" }).fill(FIRST_CODE);
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  return new URL(page.url()).searchParams.get("n") ?? "";
}

// ── Every page in fr and ar at 1440 and 360 px: lang, dir, axe, no horizontal scroll ─────────
const STATES: { ref: string; path: string; reach: (page: Page) => Promise<string | void> }[] = [
  { ref: "W11-Cmd1", path: "/commander/expediteur", reach: async () => {} },
  { ref: "W12-Cmd2", path: "/commander/destinataire", reach: (page) => fillSender(page) },
  {
    ref: "W13-Cmd3",
    path: "/commander/colis",
    reach: async (page) => {
      await fillSender(page);
      await fillRecipient(page);
    },
  },
  {
    ref: "W14-Cmd4",
    path: "/commander/service",
    reach: async (page) => {
      await fillSender(page);
      await fillRecipient(page);
      await fillParcel(page);
      await chooseStandard(page);
    },
  },
  {
    ref: "W15-Cmd5",
    path: "/commander/verification",
    reach: async (page) => {
      await toReview(page);
      await payAndAccept(page);
    },
  },
  {
    ref: "W20-Code-commande",
    path: "/commander/code",
    reach: async (page) => {
      await toReview(page);
      await payAndAccept(page);
      await page.getByRole("button", { name: "Valider la commande" }).click();
      await expect(page).toHaveURL(/\/commander\/code$/);
    },
  },
  {
    ref: "W17-HorsZone",
    path: "/commander/hors-zone",
    reach: async (page) => {
      await fillSender(page);
      await textbox(page, "Adresse de livraison").fill("Route ");
      await page.getByRole("button", { name: "Route de Sousse, km 40" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "pas encore desservie" }),
      ).toBeVisible();
      await textbox(page, "Nom du destinataire").fill("Amel B.");
      await textbox(page, "Téléphone").fill("+216 50 000 000");
      await page.getByRole("button", { name: "Continuer" }).click();
      await expect(page).toHaveURL(/\/commander\/hors-zone$/);
    },
  },
];

for (const state of STATES) {
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      test(`${state.ref} /${locale.code}${state.path} at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await start(page);
        await state.reach(page);
        await page.goto(`/${locale.code}${state.path}`);
        await expect(page).toHaveURL(new RegExp(`/${locale.code}${state.path}$`));
        await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
        await checkPage(page, locale, `${state.ref}-${locale.code}-${viewport.width}`);
      });
    }
  }
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`W16-Confirmation /${locale.code} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const code = await placeGuestOrder(page);
      await page.goto(`/${locale.code}/commander/confirmation?n=${code}`);
      await expect(page.getByText(code)).toBeVisible();
      await checkPage(page, locale, `W16-Confirmation-${locale.code}-${viewport.width}`);
    });
  }
}

// ── The 5 steps, the SMS code and the double click (Prompt 3) ────────────────────────────────
test("a guest goes through the 5 steps, checks the phone and gets one order (CMD-03, R202)", async ({
  page,
}) => {
  await start(page);
  await toReview(page);
  await payAndAccept(page);
  await page.getByRole("button", { name: "Valider la commande" }).click();
  await expect(page).toHaveURL(/\/commander\/code$/);

  const code = page.getByRole("textbox", { name: "Code à 6 chiffres" });
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(code).toHaveAttribute("inputmode", "numeric");
  await expect(code).toHaveAttribute("dir", "ltr");
  await expect(page.getByText("+216 20 ••• 000")).toBeVisible();

  await code.fill(FIRST_CODE);
  await page.getByRole("button", { name: "Vérifier" }).dblclick();
  await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Votre commande est enregistrée.",
  );
  expect(await orders(page)).toBe(1);
  expect(await draft(page)).toBeNull(); // cleared after the order
  // The light account was created once and is signed in.
  const accounts = await page.evaluate(() =>
    Object.values(JSON.parse(localStorage.getItem("fg.mock.accounts") ?? "{}")),
  );
  expect(accounts).toHaveLength(1);
});

test("a double click on Valider creates one order (R202)", async ({ page }) => {
  await page.clock.install({ time: MORNING });
  await signInAs(page, KNOWN_PHONE);
  await page.goto("/fr/commander");
  await toReview(page, KNOWN_PHONE);
  await payAndAccept(page);
  // Signed in with this exact phone: no code step.
  await page.getByRole("button", { name: "Valider la commande" }).dblclick();
  await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
  expect(await orders(page)).toBe(1);
});

test("a lost answer, a reload and a retry give one order, and edits wait for the answer (R202)", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await signInAs(page, KNOWN_PHONE);
  await page.goto("/fr/commander");
  await toReview(page, KNOWN_PHONE);
  await payAndAccept(page);
  await page.evaluate(() => localStorage.setItem("fg.mock.failNextOrderResponse", "true"));
  await page.getByRole("button", { name: "Valider la commande" }).click();

  await expect(page.getByText("La connexion a été coupée.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Modifier/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Valider la commande" })).toHaveCount(0);
  expect(await orders(page)).toBe(1); // it did reach the mock server

  await page.reload();
  await expect(page.getByText("La connexion a été coupée.")).toBeVisible();
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
  expect(await orders(page)).toBe(1);
});

// ── Price (R204, R205, R207) ─────────────────────────────────────────────────────────────────
test("W14 shows a price on every card, and the chosen card is the quote (R207 surcharge)", async ({
  page,
}) => {
  await start(page);
  await fillSender(page);
  await fillRecipient(page);
  await fillParcel(page);
  await chooseStandard(page);
  await expect(page.getByRole("radio", { name: /Express.*16,660/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Standard.*11,305/ })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Votre prix" })).toContainText("11,305 TND");
  await expect(page.getByText(/Standard[\s\S]*avant \[HEURE\]/).first()).toBeVisible();
  await expect(
    page.getByText(/Majoration pluie de 1,000\sTND incluse, plafonnée à \[PLAFOND\]/),
  ).toBeVisible();
  await expect(page.getByText("Code promo")).toHaveCount(0); // CMD-10 is L2
});

test("W15 lists every price line, even at 0,000, and they add up (R204, R207)", async ({
  page,
}) => {
  await start(page);
  await toReview(page);
  const detail = page.getByRole("complementary", { name: "Détail du prix" });
  const lines: [string, string][] = [
    ["Service et zone : Standard, zone A", "6,000"],
    ["Distance", "2,500"],
    ["Poids", "0,000"],
    ["Options", "0,000"],
    ["Majoration pluie (plafond : [PLAFOND])", "1,000"],
    ["Remise", "0,000"],
    ["TVA", "1,805"],
    ["Timbre fiscal", "0,000"],
  ];
  for (const [term, amount] of lines) {
    const row = detail.locator("dl > div").filter({ has: page.getByText(term, { exact: true }) });
    await expect(row, term).toContainText(amount);
  }
  await expect(detail).toContainText("11,305 TND");
  await expect(detail).toContainText("Montants d'exemple.");
  // Proof for a fragile parcel, no COD (cahier rule).
  await expect(page.getByText("Code envoyé au destinataire, ou signature et photo")).toBeVisible();
  // R104: a guest never sees "Compte client".
  await expect(page.getByRole("radio", { name: /Compte client/ })).toHaveCount(0);
});

test("after 15 minutes the price is recalculated and must be accepted again (R205, fake clock)", async ({
  page,
}) => {
  await start(page);
  await toReview(page);
  await payAndAccept(page);
  await expect(page.getByRole("timer")).toContainText(/1[45]:\d\d/);
  await page.clock.fastForward("14:00");
  await expect(page.getByRole("timer")).toContainText(/0[01]:\d\d/);
  await page.clock.fastForward("01:05");

  await expect(page.getByText("Le prix a été recalculé.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Valider la commande" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("button", { name: "Valider la commande" }).click({ force: true });
  await expect(page).toHaveURL(/\/commander\/verification$/);

  await page.getByRole("button", { name: "Accepter le nouveau prix" }).click();
  await expect(page.getByRole("timer")).toContainText(/1[45]:\d\d/);
  await page.getByRole("button", { name: "Valider la commande" }).click();
  await expect(page).toHaveURL(/\/commander\/code$/);
});

// ── Payment (R104), account (R101) ───────────────────────────────────────────────────────────
test("'Compte client' appears only for a merchant with a validated contract (R104)", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await signInAs(page, "+216 71 000 002"); // merchant, contract pending
  await page.goto("/fr/commander");
  await toReview(page, "+216 71 000 002");
  await expect(page.getByRole("button", { name: "Valider la commande" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Compte client/ })).toHaveCount(0);

  await signInAs(page, "+216 71 000 001"); // merchant, contract validated
  await page.goto("/fr/commander/verification");
  await expect(page.getByRole("radio", { name: /Compte client/ })).toBeVisible();
  // The refusal sentence of the mockup stays on cash on delivery (listed in the PR).
  await expect(
    page.getByText(
      "Le destinataire paie. S'il refuse, le port et le retour restent à votre charge.",
    ),
  ).toBeVisible();
});

test("a phone that already has an account is asked to sign in after the right code, then the order goes through (R101)", async ({
  page,
}) => {
  await start(page);
  await toReview(page, KNOWN_PHONE);
  await payAndAccept(page);
  await page.getByRole("button", { name: "Valider la commande" }).click();
  await page.getByRole("textbox", { name: "Code à 6 chiffres" }).fill(FIRST_CODE);
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByText("Ce numéro a déjà un compte.")).toBeVisible();
  expect(await orders(page)).toBe(0);

  await page.getByRole("link", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fcommander%2Fverification$/);
  await page.waitForLoadState("networkidle"); // hydrated: an earlier click would submit the form natively
  await page.getByRole("textbox", { name: "Téléphone ou e-mail" }).fill(KNOWN_PHONE);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/fr\/commander\/verification$/);
  // The draft is intact, the phone is the account's: no second code.
  await expect(page.getByText("Amel B., Rue Ibn Khaldoun")).toBeVisible();
  await page.getByRole("button", { name: "Valider la commande" }).click();
  await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
  expect(await orders(page)).toBe(1);
});

// ── Addresses and zones (CMD-02, R201) ───────────────────────────────────────────────────────
test("free text alone cannot continue; the pin can be placed with the keyboard", async ({
  page,
}) => {
  await start(page);
  await textbox(page, "Adresse de collecte").fill("12 rue des Orangers");
  await textbox(page, "Votre nom").fill("Yasmine K.");
  await textbox(page, "Téléphone").fill(SENDER_PHONE);
  await page.getByLabel("Créneau de collecte").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/commander\/expediteur$/);
  await expect(
    page.getByText("Choisissez une suggestion ou placez un repère sur la carte.").last(),
  ).toBeVisible();

  const map = page.getByRole("button", {
    name: "Carte : placer un repère pour Adresse de collecte",
  });
  await map.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Adresse desservie." })).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/commander\/destinataire$/);
});

test("an out-of-zone address shows W17 and no price anywhere (R201)", async ({ page }) => {
  await start(page);
  await fillSender(page, SENDER_PHONE, "Route de Sousse, km 40");
  await expect(page).toHaveURL(/\/commander\/hors-zone$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("D'où part le colis ?");
  await expect(page.getByText("Nous n'y livrons pas encore.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("TND");
  expect(decodeURIComponent(page.url())).not.toMatch(/Sousse/);
  await expect(page.getByRole("link", { name: "Demander cette zone" })).toHaveAttribute(
    "href",
    "/fr/contact",
  );
  // A later step opened directly comes back to W17, never to a price.
  await page.goto("/fr/commander/service");
  await expect(page).toHaveURL(/\/commander\/hors-zone$/);
});

// ── Step guard, draft (CMD-07) ───────────────────────────────────────────────────────────────
test("opening a later step directly goes to the first incomplete one", async ({ page }) => {
  await page.goto("/fr/commander/verification");
  await expect(page).toHaveURL(/\/fr\/commander\/expediteur$/);
  await start(page);
  await fillSender(page);
  await page.goto("/fr/commander/service");
  await expect(page).toHaveURL(/\/fr\/commander\/destinataire$/);
  await page.goto("/fr/commander/hors-zone"); // nothing is out of zone
  await expect(page).toHaveURL(/\/fr\/commander\/destinataire$/);
});

test("the draft survives a reload and a language change, and never goes in the URL", async ({
  page,
}) => {
  await start(page);
  await fillSender(page);
  await fillRecipient(page);
  await textbox(page, "Contenu").fill("Livres");
  await page.reload();
  await expect(textbox(page, "Contenu")).toHaveValue("Livres");
  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/commander\/colis$/);
  await expect(page.getByRole("textbox", { name: "Contents", exact: true })).toHaveValue("Livres");
  expect(decodeURIComponent(page.url())).not.toMatch(/Livres|Yasmine|Amel|Bourguiba|Khaldoun|216/);
});

test("in English the declared value reads 48.500 and 1,152.000", async ({ page }) => {
  await start(page);
  await fillSender(page);
  await fillRecipient(page);
  await page.goto("/en/commander/colis");
  const value = page.getByRole("textbox", { name: "Declared value (TND, optional)", exact: true });
  await value.fill("48.500");
  await expect(page.getByText("That is 48.500 TND")).toBeVisible();
  await value.fill("1,152.000");
  await expect(page.getByText("That is 1,152.000 TND")).toBeVisible();
  await value.fill("1,15");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Invalid amount.")).toBeVisible();
});

test("'Enregistrer et quitter' keeps the draft; 'Annuler' deletes it after confirmation", async ({
  page,
}) => {
  await start(page);
  await textbox(page, "Votre nom").fill("Yasmine K.");
  await page.getByRole("link", { name: "Enregistrer et quitter" }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await page.goto("/fr/commander");
  await expect(textbox(page, "Votre nom")).toHaveValue("Yasmine K.");

  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Non, continuer" }).click();
  expect(await draft(page)).not.toBeNull();
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Oui, tout effacer" }).click();
  await expect(page).toHaveURL(/\/fr$/);
  expect(await draft(page)).toBeNull();
});

test("a corrupted or unknown draft is read as empty and the page still works", async ({ page }) => {
  await page.goto("/fr");
  await page.evaluate(() => localStorage.setItem("fg.order.draft.v1", "{not json"));
  await page.goto("/fr/commander/colis");
  await expect(page).toHaveURL(/\/fr\/commander\/expediteur$/);
  await expect(textbox(page, "Votre nom")).toHaveValue("");
});

test("a pickup slot that has started is never listed (fake clock, 18:30 in Tunis)", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-04T17:30:00Z") });
  await page.goto("/fr/commander/expediteur");
  const select = page.getByLabel("Créneau de collecte");
  await expect(select.locator("option").nth(1)).toBeAttached(); // the form has loaded the draft
  const options = await select.locator("option").allTextContents();
  expect(options.slice(1).length).toBeGreaterThan(0);
  for (const option of options.slice(1)) expect(option).toMatch(/^Demain/);
});

test("the focus moves to the new h1 after each step", async ({ page }) => {
  await start(page);
  await fillSender(page);
  await expect(page.getByRole("heading", { level: 1, name: "Où va-t-il ?" })).toBeFocused();
});

// ── After the order (W16, CMD-06) ────────────────────────────────────────────────────────────
test("W16: tracking link, sample slip, /suivi finds the order without personal data", async ({
  page,
  request,
}) => {
  const code = await placeGuestOrder(page);
  await expect(page.getByText("Amel B. a reçu son lien de suivi par SMS")).toBeVisible();
  // CMD-08: the cancel button shows once the order has loaded.
  await expect(page.getByRole("button", { name: /Annuler la commande/ })).toBeVisible();
  const slip = page.getByRole("link", { name: "Bon de commande (exemple)" });
  const href = await slip.getAttribute("href");
  expect(href).toBe("/examples/bon-de-commande-exemple.pdf");
  const pdf = await request.get(href ?? "");
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("link", { name: "Suivre ma livraison" }).click();
  await expect(page).toHaveURL(new RegExp(`/fr/suivi\\?n=${code}$`));
  await expect(page.getByText("Nous avons reçu votre commande")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/Amel|Yasmine|Bourguiba|Khaldoun/);
});

test("W16 with an unknown or invalid number shows a neutral page", async ({ page }) => {
  for (const n of ["FG-0000-0000", "<b>x</b>"]) {
    await page.goto(`/fr/commander/confirmation?n=${encodeURIComponent(n)}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aucune commande à afficher.");
  }
});

test("an unknown path under /commander is a 404 with the site header and footer", async ({
  page,
}) => {
  const response = await page.goto("/fr/commander/inconnu");
  expect(response?.status()).toBe(404);
  await expect(page.locator("header nav")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("each step shows its h1 and says ordering needs JavaScript", async ({ page, request }) => {
    const pages: [string, string][] = [
      ["/fr/commander/expediteur", "D'où part le colis ?"],
      ["/fr/commander/verification", "Vérifiez et validez"],
    ];
    for (const [path, title] of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      // Chromium still parses <noscript> as if scripts ran when Playwright turns JavaScript off,
      // so the message is checked in the server HTML: a browser without JavaScript shows it.
      const html = await (await request.get(path)).text();
      expect(html).toMatch(
        /<noscript><p[^>]*>Pour commander, activez JavaScript dans votre navigateur\.<\/p><\/noscript>/,
      );
    }
  });
});

test("cmd chrome: no site nav, no footer, no dark-mode button", async ({ page }) => {
  await page.goto("/fr/commander/expediteur");
  await expect(page.locator("header nav")).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /sombre|dark/i })).toHaveCount(0);
  await shot(page, "cmd-chrome-fr-1440");
});

// ── Order logic (review of PR #5) ────────────────────────────────────────────────────────────
const signedInReview = async (page: Page, phone = KNOWN_PHONE) => {
  await page.clock.install({ time: MORNING });
  await signInAs(page, phone);
  await page.goto("/fr/commander");
  await toReview(page, phone);
};

test.describe("order logic", () => {
  test("a declared value typed in fr keeps its amount in en, through to the order", async ({
    page,
  }) => {
    await page.clock.install({ time: MORNING });
    await signInAs(page, KNOWN_PHONE);
    await page.goto("/fr/commander");
    await fillSender(page, KNOWN_PHONE);
    await fillRecipient(page);
    await page.getByRole("radio", { name: /Petit colis/ }).check();
    await textbox(page, "Poids estimé (kg)").fill("2");
    await textbox(page, "Contenu").fill("Vêtements");
    await textbox(page, "Valeur déclarée (TND, facultatif)").fill("1 152,5");
    await expect(page.getByText("Soit 1 152,500 TND")).toBeVisible();
    await page.getByRole("link", { name: "EN", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/commander\/colis$/);
    const value = page.getByRole("textbox", { name: "Declared value (TND, optional)" });
    await expect(value).toHaveValue("1,152.500");
    await expect(page.getByText("That is 1,152.500 TND")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/en\/commander\/service$/);
    await page.getByRole("radio", { name: /Standard/ }).click();
    await expect(page.getByRole("radio", { name: /Standard/ })).toBeChecked();
    await page.getByRole("button", { name: "Review my order" }).click();
    await expect(page).toHaveURL(/\/en\/commander\/verification$/);
    expect((await draft(page)).parcel.declaredValueMillimes).toBe(1_152_500);
    await page.getByRole("radio", { name: /Cash at pickup/ }).click();
    await page.getByRole("checkbox", { name: /terms of sale/ }).check();
    await page.getByRole("button", { name: "Confirm the order" }).click();
    await expect(page).toHaveURL(/\/en\/commander\/confirmation\?n=FG-/);
    expect(await orders(page)).toBe(1);
  });

  test("in en, 1,152.000 goes through to W15", async ({ page }) => {
    await start(page);
    await fillSender(page);
    await fillRecipient(page);
    await page.goto("/en/commander/colis");
    await page.getByRole("radio", { name: /Small parcel/ }).check();
    await page.getByRole("textbox", { name: "Estimated weight (kg)" }).fill("2");
    await page.getByRole("textbox", { name: "Contents", exact: true }).fill("Books");
    await page.getByRole("textbox", { name: "Declared value (TND, optional)" }).fill("1,152.000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/en\/commander\/service$/);
    await page.getByRole("radio", { name: /Standard/ }).click();
    await expect(page.getByRole("radio", { name: /Standard/ })).toBeChecked();
    await page.getByRole("button", { name: "Review my order" }).click();
    await expect(page).toHaveURL(/\/en\/commander\/verification$/);
  });

  test("a language change during a lost answer gives no conflict, and the draft is cleared", async ({
    page,
  }) => {
    await signedInReview(page);
    await payAndAccept(page);
    await page.evaluate(() => localStorage.setItem("fg.mock.failNextOrderResponse", "true"));
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page.getByText("La connexion a été coupée.")).toBeVisible();
    await page.goto("/en/commander/verification");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page).toHaveURL(/\/en\/commander\/confirmation\?n=FG-/);
    expect(await orders(page)).toBe(1);
    expect(await draft(page)).toBeNull();
  });

  test("W14: Programmée has its price, takes a slot and is the quote", async ({ page }) => {
    await start(page);
    await fillSender(page);
    await fillRecipient(page);
    await fillParcel(page);
    const scheduled = page.getByRole("radio", { name: /Programmée.*12,495/ });
    await expect(scheduled).toBeEnabled();
    await scheduled.click();
    await expect(scheduled).toBeChecked();
    await expect(page.getByRole("complementary", { name: "Votre prix" })).toContainText(
      "12,495 TND",
    );
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await expect(page.getByText("Choisissez un créneau.").first()).toBeVisible();
    await page.getByLabel("Créneau de livraison").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await expect(page.getByRole("complementary", { name: "Détail du prix" })).toContainText(
      "12,495 TND",
    );
    await expect(page.getByText(/^Programmée, Aujourd'hui, de /)).toBeVisible();
  });

  test("W14: an address with two services keeps Programmée disabled", async ({ page }) => {
    await start(page);
    await fillSender(page);
    await fillRecipient(page, "Rue de Marseille");
    await fillParcel(page);
    await expect(page.getByRole("radio", { name: /Programmée/ })).toBeDisabled();
    await expect(page.getByText("Pas encore disponible pour ces adresses.")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Standard.*11,305/ })).toBeEnabled();
  });

  test("a weight changed after the quote is priced again before W15", async ({ page }) => {
    await start(page);
    await toReview(page);
    await page.goto("/fr/commander/colis");
    await textbox(page, "Poids estimé (kg)").fill("5");
    await page.goto("/fr/commander/verification");
    await expect(page).toHaveURL(/\/commander\/service$/);
    await expect(page.getByRole("complementary", { name: "Votre prix" })).toContainText(
      "12,805 TND",
    );
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await expect(page.getByRole("complementary", { name: "Détail du prix" })).toContainText(
      "12,805 TND",
    );
  });

  test("a pending answer goes to W15 from every step, even once the pickup slot has started", async ({
    page,
  }) => {
    await signedInReview(page);
    await payAndAccept(page);
    await page.evaluate(() => localStorage.setItem("fg.mock.failNextOrderResponse", "true"));
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page.getByText("La connexion a été coupée.")).toBeVisible();
    await page.clock.setSystemTime(new Date("2026-11-04T10:30:00Z")); // 11:30, the slot started
    for (const path of ["", "/expediteur", "/colis", "/service", "/code", "/verification"]) {
      await page.goto(`/fr/commander${path}`);
      await expect(page).toHaveURL(/\/fr\/commander\/verification$/);
      await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Annuler" })).toHaveCount(0);
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
    expect(await orders(page)).toBe(1);
  });

  test("two tabs: a stale tab finds the order the other tab placed and never restores the draft", async ({
    page,
  }) => {
    await signedInReview(page);
    await payAndAccept(page);
    const stale = await page.context().newPage();
    await stale.goto("/fr/commander/verification");
    await expect(stale.getByRole("checkbox", { name: /CGV/ })).toBeChecked();

    await page.getByRole("radio", { name: /Espèces à la livraison/ }).click();
    await page.getByRole("checkbox", { name: /destinataire refuse le colis/ }).check(); // R607
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
    const code = new URL(page.url()).searchParams.get("n");

    await stale.getByRole("button", { name: "Valider la commande" }).click();
    await expect(stale).toHaveURL(new RegExp(`/commander/confirmation\\?n=${code}$`));
    expect(await orders(page)).toBe(1);
    expect(await draft(page)).toBeNull();
  });

  test("two tabs: a stale tab cannot edit a draft whose answer is pending", async ({ page }) => {
    await signedInReview(page);
    await payAndAccept(page);
    const stale = await page.context().newPage();
    await stale.goto("/fr/commander/colis");
    await expect(textbox(stale, "Poids estimé (kg)")).toHaveValue("2");

    await page.evaluate(() => localStorage.setItem("fg.mock.failNextOrderResponse", "true"));
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page.getByText("La connexion a été coupée.")).toBeVisible();
    const pending = await draft(page);
    expect(pending.pendingSubmit).not.toBeNull();

    await textbox(stale, "Poids estimé (kg)").fill("5");
    await expect(stale).toHaveURL(/\/commander\/verification$/);
    const after = await draft(page);
    expect(after.pendingSubmit).toEqual(pending.pendingSubmit);
    expect(after.expiresAt).toBe(pending.expiresAt);
    expect(after.parcel.weightKg).toBe("2");
  });

  test("a signed-in merchant who checks another sender phone keeps the session and pays on account (R104)", async ({
    page,
  }) => {
    await page.clock.install({ time: MORNING });
    await signInAs(page, "+216 71 000 001");
    const before = await page.evaluate(() => localStorage.getItem("fg.mock.session"));
    await page.goto("/fr/commander");
    await toReview(page, SENDER_PHONE);
    await page.getByRole("radio", { name: /Compte client/ }).click();
    await page.getByRole("checkbox", { name: /CGV/ }).check();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/code$/);
    await page.getByRole("textbox", { name: "Code à 6 chiffres" }).fill(FIRST_CODE);
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
    expect(await page.evaluate(() => localStorage.getItem("fg.mock.session"))).toBe(before);
  });

  test("W20: a refusal after the code goes to W15, and coming back to W20 never submits", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.clock.fastForward("11:00");
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/code$/);
    await page.clock.fastForward("04:30"); // the price expires, the code is still valid
    await page.getByRole("textbox", { name: "Code à 6 chiffres" }).fill(FIRST_CODE);
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await expect(page.getByText("Le prix a été recalculé.")).toBeVisible();
    await page.getByRole("button", { name: "Accepter le nouveau prix" }).click();

    await page.goto("/fr/commander/code");
    await expect(page).toHaveURL(/\/commander\/verification$/);
    expect(await orders(page)).toBe(0);
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
    expect(await orders(page)).toBe(1);
  });

  test("a pin replaces the typed address with the pin label", async ({ page }) => {
    await start(page);
    const address = textbox(page, "Adresse de collecte");
    await address.fill("Route de Sousse");
    const map = page.getByRole("button", {
      name: "Carte : placer un repère pour Adresse de collecte",
    });
    await map.focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Adresse desservie." })).toBeVisible();
    await expect(address).toHaveValue("Repère placé sur la carte");
    // The label is shown, not stored (final review I3): the text stays empty with the pin.
    expect((await draft(page)).sender.address.text).toBe("");
  });

  test("a slot chosen for tomorrow reads today on the next day", async ({ page }) => {
    await start(page);
    await textbox(page, "Adresse de collecte").fill("Avenue");
    await page.getByRole("button", { name: "Avenue Habib Bourguiba" }).click();
    await expect(page.getByRole("status").filter({ hasText: /desservie/ })).toBeVisible();
    await textbox(page, "Votre nom").fill("Yasmine K.");
    await textbox(page, "Téléphone").fill(SENDER_PHONE);
    const select = page.getByLabel("Créneau de collecte");
    const options = await select.locator("option").allTextContents();
    const tomorrow = options.find((option) => option.startsWith("Demain"));
    await select.selectOption({ label: tomorrow ?? "" });
    await page.getByRole("button", { name: "Continuer" }).click();
    await fillRecipient(page);
    await fillParcel(page);
    await chooseStandard(page);
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await expect(page.getByText(tomorrow ?? "")).toBeVisible();

    await page.clock.setSystemTime(new Date("2026-11-05T07:00:00Z")); // 08:00 the next day
    await page.reload();
    await expect(page.getByText(tomorrow?.replace("Demain", "Aujourd'hui") ?? "")).toBeVisible();
  });

  test("the previous price survives a reload after a recalculation (R205)", async ({ page }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.clock.fastForward("15:05");
    await expect(page.getByText("Le prix a été recalculé.")).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Avant : 11,305\sTND\./)).toBeVisible();
  });

  test("a signed-in customer with a verified phone sees no phone-check note", async ({ page }) => {
    await signedInReview(page);
    await expect(page.getByRole("button", { name: "Valider la commande" })).toBeVisible();
    await expect(
      page.getByText("Nous vérifions votre téléphone par SMS avant la première commande."),
    ).toHaveCount(0);
  });

  test("'Compte client' chosen before a sign-out is cleared (R104)", async ({ page }) => {
    await signedInReview(page, "+216 71 000 001");
    await page.getByRole("radio", { name: /Compte client/ }).click();
    await expect(page.getByRole("radio", { name: /Compte client/ })).toBeChecked();
    await page.evaluate(() => localStorage.removeItem("fg.mock.session"));
    await page.reload();
    await expect(page.getByRole("button", { name: "Valider la commande" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Compte client/ })).toHaveCount(0);
    await expect.poll(async () => (await draft(page)).payment).toBeNull();
  });
});

// ── Languages, focus and announcements, mockup (PR #5, group C) ──────────────────────────────
test.describe("languages, focus and mockup", () => {
  test("W16: the language switcher keeps ?n= (item 19)", async ({ page }) => {
    const code = await placeGuestOrder(page);
    await page.locator('header a[hreflang="ar"]').click();
    await expect(page).toHaveURL(new RegExp(`/ar/commander/confirmation\\?n=${code}$`));
    await expect(page.getByText(code)).toBeVisible();
  });

  test("W15: after 'Accepter le nouveau prix' the focus moves on and the change is announced (item 20)", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.clock.fastForward("15:05");
    await page.getByRole("button", { name: "Accepter le nouveau prix" }).click();
    await expect(page.getByRole("button", { name: "Valider la commande" })).toBeFocused();
    await expect(
      page.locator("main [role=status]").filter({ hasText: "Nouveau prix accepté." }),
    ).toHaveCount(1);
  });

  test("W17 focuses its h1 and shows step 1 for a departure address (items 20, 24)", async ({
    page,
  }) => {
    await start(page);
    await fillSender(page, SENDER_PHONE, "Route de Sousse, km 40");
    await expect(page).toHaveURL(/\/commander\/hors-zone$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "D'où part le colis ?" }),
    ).toBeFocused();
    await expect(page.locator('li[aria-current="step"]')).toContainText("1. Expéditeur");
  });

  test("W17 shows step 2 for an arrival address (item 24)", async ({ page }) => {
    await start(page);
    await fillSender(page);
    await textbox(page, "Adresse de livraison").fill("Route ");
    await page.getByRole("button", { name: "Route de Sousse, km 40" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "pas encore desservie" }),
    ).toBeVisible();
    await textbox(page, "Nom du destinataire").fill("Amel B.");
    await textbox(page, "Téléphone").fill("+216 50 000 000");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/commander\/hors-zone$/);
    await expect(page.getByRole("heading", { level: 1, name: "Où va-t-il ?" })).toBeFocused();
    await expect(page.locator('li[aria-current="step"]')).toContainText("2. Destinataire");
  });

  test("W11 and W12: an address error takes the focus (item 20)", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(textbox(page, "Adresse de collecte")).toBeFocused();
    await fillSender(page);
    await expect(page).toHaveURL(/\/commander\/destinataire$/);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(textbox(page, "Adresse de livraison")).toBeFocused();
  });

  test("W15: a missing payment, then missing CGV, take the focus (item 20)", async ({ page }) => {
    await start(page);
    await toReview(page);
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page.getByRole("radio", { name: /Espèces à l'enlèvement/ })).toBeFocused();
    await page.getByRole("radio", { name: /Espèces à l'enlèvement/ }).click();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page.getByRole("checkbox", { name: /CGV/ })).toBeFocused();
  });

  test("W14: no service chosen takes the focus to the first service (item 20)", async ({
    page,
  }) => {
    await start(page);
    await fillSender(page);
    await fillRecipient(page);
    await fillParcel(page);
    await expect(page).toHaveURL(/\/commander\/service$/);
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await expect(page.locator("#service-error")).toHaveText("Choisissez un service.");
    await expect(page.getByRole("radio", { name: /Express/ })).toBeFocused();
  });

  test("W20: a pasted code with a space is accepted, the error is linked to the input (item 21)", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/code$/);
    const code = page.getByRole("textbox", { name: "Code à 6 chiffres" });
    await code.fill("000000");
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(code).toHaveAccessibleDescription(/Code incorrect/);
    await code.focus();
    await page.keyboard.insertText("482 615");
    await expect(code).toHaveValue(FIRST_CODE);
  });

  test("the pin position is announced politely on arrow keys (item 23)", async ({ page }) => {
    await start(page);
    await page
      .getByRole("button", { name: "Carte : placer un repère pour Adresse de collecte" })
      .focus();
    await page.keyboard.press("ArrowUp");
    await expect(
      page.locator('main [aria-live="polite"]').filter({ hasText: /50\s%.*45\s%/ }),
    ).toHaveCount(1);
  });

  test("W15 in ar: the edit link and the summary use the Arabic patterns (item 23)", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    await page.goto("/ar/commander/verification");
    await expect(page.getByRole("link", { name: "تعديل: توصيلك", exact: true })).toBeVisible();
    const summary = page.locator("main dl").first().locator("dd");
    await expect(summary.first()).toBeVisible();
    for (const text of await summary.allInnerTexts()) expect(text).not.toContain(", ");
  });

  test("W15 reads like the mockup: service with [HEURE], '1 petit colis, 2 kg, fragile' (item 24)", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    const summary = page.locator("main dl").first();
    await expect(summary).toContainText("Standard, avant [HEURE]");
    await expect(summary).toContainText("1 petit colis, 2 kg, fragile");
  });

  test("W16 at 1440 px: stepper, full-column card, buttons on one row (item 24)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await placeGuestOrder(page);
    await expect(page.getByRole("list", { name: "Étapes de la commande" })).toBeVisible();
    const card = await page
      .locator("main h1")
      .locator("xpath=ancestor::*[contains(@class,'rounded')][1]")
      .boundingBox();
    const stepper = await page.getByRole("list", { name: "Étapes de la commande" }).boundingBox();
    expect(Math.round(card?.width ?? 0)).toBe(Math.round(stepper?.width ?? -1));
    const tops = await Promise.all(
      [/Suivre ma livraison/, /Bon de commande/, /Nouvelle commande/].map(async (name) =>
        Math.round((await page.getByRole("link", { name }).boundingBox())?.y ?? -1),
      ),
    );
    expect(new Set(tops).size).toBe(1);
  });
});
