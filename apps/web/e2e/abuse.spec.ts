import { expect, test, type Page } from "@playwright/test";
import { FIRST_CODE, MORNING } from "./helpers";

/**
 * PR #5, group D: a careless or hostile customer on the order flow and the sign-in (mock data,
 * fake names and phones only). Every URL a page goes to is recorded, and none may carry a phone,
 * an e-mail, a name or an address.
 */

const SENDER_PHONE = "+216 20 000 000";
const OTHER_PHONE = "+216 20 000 999";
const RECIPIENT_PHONE = "+216 50 000 000";
const KNOWN_PHONE = "+216 98 000 001"; // fixture account (lib/data/fixtures/accounts.ts)
const PASSWORD = "fastgo-demo-2026"; // fixture password, mock only

// ── No phone, e-mail, name or address in any URL ─────────────────────────────────────────────
const PHONE_DIGITS = ["20000000", "20000999", "50000000", "98000001", "71000001", "71000002"];
const WORDS = /Bourguiba|Habib|Khaldoun|Marseille|Sousse|Yasmine|Amel|Sami|Vêtements|Livres|@/i;
let visited: string[] = [];

const record = (page: Page) => {
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
};

test.beforeEach(async ({ page, context }) => {
  visited = [];
  record(page);
  context.on("page", record);
});

test.afterEach(async ({ context }) => {
  for (const open of context.pages()) visited.push(open.url());
  expect(visited.length).toBeGreaterThan(0);
  for (const url of visited) {
    const text = decodeURIComponent(url);
    const digits = text.replace(/\D/g, "");
    for (const phone of PHONE_DIGITS) expect(digits, url).not.toContain(phone);
    expect(text, url).not.toMatch(WORDS);
  }
});

// ── Flow helpers (same steps as order-flow.spec.ts) ──────────────────────────────────────────
const textbox = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const orders = (page: Page) =>
  page.evaluate(
    () => Object.keys(JSON.parse(localStorage.getItem("fg.mock.orders") ?? "{}")).length,
  );
const draft = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("fg.order.draft.v1") ?? "null"));

async function start(page: Page, locale = "fr") {
  await page.clock.install({ time: MORNING });
  await page.goto(`/${locale}/commander`);
  await expect(page).toHaveURL(new RegExp(`/${locale}/commander/expediteur$`));
}

async function fillSender(page: Page, phone = SENDER_PHONE) {
  await textbox(page, "Adresse de collecte").fill("Avenue");
  await page.getByRole("button", { name: "Avenue Habib Bourguiba" }).click();
  await expect(page.getByRole("status").filter({ hasText: /desservie/ })).toBeVisible();
  await textbox(page, "Votre nom").fill("Yasmine K.");
  await textbox(page, "Téléphone").fill(phone);
  await page.getByLabel("Créneau de collecte").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function fillRecipient(page: Page) {
  await expect(page).toHaveURL(/\/commander\/destinataire$/);
  await textbox(page, "Adresse de livraison").fill("Rue Ib");
  await page.getByRole("button", { name: "Rue Ibn Khaldoun" }).click();
  await expect(page.getByRole("status").filter({ hasText: /desservie/ })).toBeVisible();
  await textbox(page, "Nom du destinataire").fill("Amel B.");
  await textbox(page, "Téléphone").fill(RECIPIENT_PHONE);
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function fillParcel(page: Page) {
  await expect(page).toHaveURL(/\/commander\/colis$/);
  await page.getByRole("radio", { name: /Petit colis/ }).check();
  await textbox(page, "Poids estimé (kg)").fill("2");
  await textbox(page, "Contenu").fill("Vêtements");
  await textbox(page, "Valeur déclarée (TND, facultatif)").fill("48,500");
  await page.getByRole("checkbox", { name: "Colis fragile" }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function chooseStandard(page: Page) {
  await expect(page).toHaveURL(/\/commander\/service$/);
  await page.getByRole("radio", { name: /Standard/ }).click();
  await expect(page.getByRole("radio", { name: /Standard/ })).toBeChecked();
}

async function toReview(page: Page, phone = SENDER_PHONE) {
  await fillSender(page, phone);
  await fillRecipient(page);
  await fillParcel(page);
  await chooseStandard(page);
  await page.getByRole("button", { name: "Vérifier ma commande" }).click();
  await expect(page).toHaveURL(/\/commander\/verification$/);
}

async function payAndAccept(page: Page) {
  await page.getByRole("radio", { name: /Espèces à l'enlèvement/ }).click();
  await expect(page.getByRole("radio", { name: /Espèces à l'enlèvement/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /CGV/ }).check();
}

async function signedInReview(page: Page) {
  await page.clock.install({ time: MORNING });
  await page.goto("/fr/connexion");
  await page.getByRole("textbox", { name: "Téléphone ou e-mail" }).fill(KNOWN_PHONE);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await page.goto("/fr/commander");
  await toReview(page, KNOWN_PHONE);
  await payAndAccept(page);
}

async function enterCode(page: Page, code = FIRST_CODE) {
  await expect(page).toHaveURL(/\/commander\/code$/);
  await page.getByRole("textbox", { name: "Code à 6 chiffres" }).fill(code);
  await page.getByRole("button", { name: "Vérifier" }).click();
}

const CONFIRMED = /\/commander\/confirmation\?n=FG-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

async function placeGuestOrder(page: Page) {
  await start(page);
  await toReview(page);
  await payAndAccept(page);
  await page.getByRole("button", { name: "Valider la commande" }).click();
  await enterCode(page);
  await expect(page).toHaveURL(CONFIRMED);
  return new URL(page.url()).searchParams.get("n") ?? "";
}

// ── Scenarios ────────────────────────────────────────────────────────────────────────────────
test.describe("abuse", () => {
  test("back after the confirmation never sends the order again and shows an empty form", async ({
    page,
  }) => {
    const code = await placeGuestOrder(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/fr\/commander\/expediteur$/);
    await expect(textbox(page, "Votre nom")).toHaveValue("");
    await expect(textbox(page, "Téléphone")).toHaveValue("");
    for (let i = 0; i < 3; i += 1) {
      await page.goBack();
      await page.waitForLoadState();
    }
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
    expect(await orders(page)).toBe(1);
    await page.goto(`/fr/commander/confirmation?n=${code}`);
    await expect(page.getByText(code)).toBeVisible();
    expect(await orders(page)).toBe(1);
  });

  test("two tabs pressing Valider at the same time give one order, shown in both", async ({
    page,
  }) => {
    await signedInReview(page);
    const other = await page.context().newPage();
    await other.goto("/fr/commander/verification");
    await expect(other.getByRole("checkbox", { name: /CGV/ })).toBeChecked();
    await Promise.all([
      page.getByRole("button", { name: "Valider la commande" }).click(),
      other.getByRole("button", { name: "Valider la commande" }).click(),
    ]);
    await expect(page).toHaveURL(CONFIRMED);
    await expect(other).toHaveURL(CONFIRMED);
    expect(new URL(other.url()).searchParams.get("n")).toBe(
      new URL(page.url()).searchParams.get("n"),
    );
    expect(await orders(page)).toBe(1);
    expect(await draft(page)).toBeNull();
  });

  test("two tabs: a stale W15 never sends what another tab has changed since", async ({ page }) => {
    await signedInReview(page);
    const other = await page.context().newPage();
    await other.goto("/fr/commander/colis");
    await textbox(other, "Poids estimé (kg)").fill("5");
    await expect.poll(async () => (await draft(page)).parcel.weightKg).toBe("5");

    // The first tab still shows 2 kg and its price: it must not send them, nor write them back.
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/service$/);
    expect(await orders(page)).toBe(0);
    expect((await draft(page)).parcel.weightKg).toBe("5");
    await expect(page.getByRole("complementary", { name: "Votre prix" })).toContainText(
      "12,805 TND",
    );
  });

  test("two tabs: a stale W15 shows a payment changed elsewhere instead of sending its own", async ({
    page,
  }) => {
    await signedInReview(page);
    const other = await page.context().newPage();
    await other.goto("/fr/commander/verification");
    await other.getByRole("radio", { name: /Espèces à la livraison/ }).click();
    await expect.poll(async () => (await draft(page)).payment).toBe("cashDelivery");

    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(
      page.getByText("Votre commande a été modifiée dans un autre onglet."),
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: /Espèces à la livraison/ })).toBeChecked();
    expect(await orders(page)).toBe(0);
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(CONFIRMED);
    expect(await orders(page)).toBe(1);
  });

  test("a phone changed after its code was checked needs a new code for the new phone", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.clock.fastForward("11:00");
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await page.clock.fastForward("04:30"); // the price expires: the code is checked, no order
    await enterCode(page);
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await page.getByRole("button", { name: "Accepter le nouveau prix" }).click();
    expect((await draft(page)).verifiedPhone).toBe("+21620000000");
    expect(await orders(page)).toBe(0);

    await page.goto("/fr/commander/expediteur");
    await textbox(page, "Téléphone").fill(OTHER_PHONE);
    expect((await draft(page)).verifiedPhone).toBeNull();
    await page.goto("/fr/commander/verification");
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/code$/);
    await expect(page.getByText("+216 20 ••• 999")).toBeVisible();
    expect(await orders(page)).toBe(0);
    await enterCode(page, FIRST_CODE); // the first code sent to the new phone
    await expect(page).toHaveURL(CONFIRMED);
    expect(await orders(page)).toBe(1);
  });

  test("a phone swapped in storage behind a verified one still needs its own code", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.clock.fastForward("11:00");
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await page.clock.fastForward("04:30");
    await enterCode(page);
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await page.getByRole("button", { name: "Accepter le nouveau prix" }).click();
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("fg.order.draft.v1") ?? "{}");
      saved.sender.phone = "+216 20 000 999"; // verifiedPhone left as it was
      localStorage.setItem("fg.order.draft.v1", JSON.stringify(saved));
    });
    await page.reload();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/code$/);
    await expect(page.getByText("+216 20 ••• 999")).toBeVisible();
    expect(await orders(page)).toBe(0);
  });

  test("a priced field edited after accepting a new price is priced again, then ordered", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.clock.fastForward("15:05");
    await page.getByRole("button", { name: "Accepter le nouveau prix" }).click();
    await page.goto("/fr/commander/colis");
    await page.getByRole("checkbox", { name: "Colis fragile" }).uncheck();
    await page.goto("/fr/commander/verification");
    await expect(page).toHaveURL(/\/commander\/service$/);
    const total = await page.getByRole("complementary", { name: "Votre prix" }).textContent();
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await expect(page.getByText("Le prix a été recalculé.")).toHaveCount(0);
    const detail = page.getByRole("complementary", { name: "Détail du prix" });
    const amount = /(\d+,\d{3})\sTND/.exec(total ?? "")?.[1] ?? "none";
    await expect(detail).toContainText(amount);
    await expect(detail).not.toContainText("Fragile");
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await enterCode(page);
    await expect(page).toHaveURL(CONFIRMED);
    expect(await orders(page)).toBe(1);
  });

  test("W15 left for 16 minutes is priced again before anything is sent", async ({ page }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.goto("/fr");
    await page.clock.fastForward("16:00");
    await page.goto("/fr/commander/verification");
    await page.getByRole("button", { name: "Valider la commande" }).click({ force: true });
    await expect(page.getByText("Le prix a été recalculé.")).toBeVisible();
    await expect(page).toHaveURL(/\/commander\/verification$/);
    expect(await orders(page)).toBe(0);
    await page.getByRole("button", { name: "Accepter le nouveau prix" }).click();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await enterCode(page);
    await expect(page).toHaveURL(CONFIRMED);
    expect(await orders(page)).toBe(1);
  });

  test("a reload on /commander/code keeps the code that was sent, and one order", async ({
    page,
  }) => {
    await start(page);
    await toReview(page);
    await payAndAccept(page);
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/code$/);
    await page.reload();
    await expect(page.getByText("+216 20 ••• 000")).toBeVisible();
    await page.reload();
    expect(await orders(page)).toBe(0);
    await enterCode(page, FIRST_CODE);
    await expect(page).toHaveURL(CONFIRMED);
    await page.goBack();
    await page.reload();
    expect(await orders(page)).toBe(1);
  });

  test("switching language at every step keeps the step and what was typed", async ({ page }) => {
    const swap = async (path: RegExp, check: (p: Page) => Promise<void>) => {
      for (const [label, locale] of [
        ["EN", "en"],
        ["عربي", "ar"],
        ["FR", "fr"],
      ] as const) {
        await page.getByRole("link", { name: label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/commander/${path.source}`));
        await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
        await check(page);
      }
    };
    await start(page);
    await textbox(page, "Votre nom").fill("Yasmine K.");
    await swap(/expediteur$/, async (p) => {
      await expect(p.locator('input[name="name"]')).toHaveValue("Yasmine K.");
    });
    await fillSender(page);
    await swap(/destinataire$/, async (p) => {
      await expect(p.locator('input[name="name"]')).toHaveValue("");
    });
    await fillRecipient(page);
    await swap(/colis$/, async () => {});
    await fillParcel(page);
    await chooseStandard(page);
    await swap(/service$/, async (p) => {
      await expect(p.locator("#service-standard")).toBeChecked();
    });
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await payAndAccept(page);
    await swap(/verification$/, async (p) => {
      await expect(p.locator("#order-terms")).toBeChecked();
      await expect(p.locator("#payment-cashPickup")).toBeChecked();
    });
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/fr\/commander\/code$/);
    await swap(/code$/, async (p) => {
      await expect(p.getByText("+216 20 ••• 000")).toBeVisible();
    });
    await enterCode(page);
    await expect(page).toHaveURL(CONFIRMED);
    expect(await orders(page)).toBe(1);
    expect((await draft(page)) ?? null).toBeNull();
  });

  test("declared values: 1,152 in en, 1 152,500 in fr, Arabic-Indic digits in ar", async ({
    page,
  }) => {
    await start(page);
    await fillSender(page);
    await fillRecipient(page);
    const field = page.locator('input[name="declaredValue"]');
    const cases: [string, string, number][] = [
      ["en", "1,152", 1_152_000],
      ["en", "1,152.5", 1_152_500],
      ["fr", "1 152,500", 1_152_500],
      ["fr", "1 152,500", 1_152_500],
      ["fr", "١ ١٥٢,٥", 1_152_500],
      ["ar", "١٬١٥٢٫٥٠٠", 1_152_500],
      ["ar", "١١٥٢", 1_152_000],
      ["ar", "۱۱۵۲٫۵", 1_152_500],
    ];
    for (const [locale, typed, millimes] of cases) {
      await page.goto(`/${locale}/commander/colis`);
      await field.fill(typed);
      await expect
        .poll(async () => (await draft(page)).parcel.declaredValueMillimes)
        .toBe(millimes);
      await page.reload();
      await expect(field).not.toHaveValue("");
      await expect
        .poll(async () => (await draft(page)).parcel.declaredValueMillimes)
        .toBe(millimes);
    }
    // Arabic-Indic weight and count are read too, through to W14.
    await page.goto("/ar/commander/colis");
    await page.locator('input[name="type"][value="small"]').check();
    await page.locator('input[name="weightKg"]').fill("٢");
    await page.locator('input[name="count"]').fill("١");
    await page.locator('input[name="content"]').fill("Vêtements");
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/ar\/commander\/service$/);
  });

  const BROKEN = [
    "{not json",
    "null",
    "[]",
    '"draft"',
    JSON.stringify({ version: 1 }),
    JSON.stringify({
      version: 1,
      expiresAt: 9e15,
      idempotencyKey: "k",
      sender: null,
      recipient: null,
      parcel: null,
      service: null,
    }),
    JSON.stringify({
      version: 1,
      expiresAt: 9e15,
      idempotencyKey: "k",
      sender: {},
      recipient: {},
      parcel: {},
      service: {},
    }),
    JSON.stringify({
      version: 1,
      expiresAt: 9e15,
      idempotencyKey: "k",
      sender: { address: "x", name: 3, phone: null, slot: "x" },
      recipient: { address: { text: 1, zone: "z" }, name: [], phone: {} },
      parcel: { type: "huge", count: 1, weightKg: 2, declaredValueMillimes: "1e3" },
      service: { code: "teleport", slot: 4 },
      quote: "free",
      payment: "card",
    }),
  ];

  for (const [index, value] of BROKEN.entries()) {
    test(`a corrupted draft (${index + 1}) is read as empty on every step`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.clock.install({ time: MORNING });
      await page.goto("/fr");
      for (const path of ["", "/colis", "/service", "/verification", "/code", "/expediteur"]) {
        await page.evaluate((text) => localStorage.setItem("fg.order.draft.v1", text), value);
        await page.goto(`/fr/commander${path}`);
        await expect(page).toHaveURL(/\/fr\/commander\/expediteur$/);
        await expect(textbox(page, "Votre nom")).toHaveValue("");
      }
      expect(errors).toEqual([]);
      await fillSender(page);
      await expect(page).toHaveURL(/\/commander\/destinataire$/);
    });
  }

  test("a confirmation link opened in another browser shows nothing about the order", async ({
    page,
    browser,
  }) => {
    const code = await placeGuestOrder(page);
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();
    record(other);
    for (const n of [code, code.toLowerCase(), ` ${code} `]) {
      await other.goto(`/fr/commander/confirmation?n=${encodeURIComponent(n)}`);
      await expect(
        other.getByRole("heading", { level: 1, name: "Aucune commande à afficher." }),
      ).toBeVisible();
      await expect(other.getByText("Amel")).toHaveCount(0);
      await expect(other.getByRole("link", { name: /Suivre/ })).toHaveCount(0);
    }
    for (const open of elsewhere.pages()) visited.push(open.url());
    await elsewhere.close();
  });
});
