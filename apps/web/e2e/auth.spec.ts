import { expect, test, type Page } from "@playwright/test";
import {
  FIRST_CODE,
  LOCALES,
  MORNING,
  SECOND_CODE,
  VIEWPORTS,
  checkPage,
  openForm,
} from "./helpers";

/** Sign-in and sign-up (W18 to W22, ESP-01, ESP-09) on mock data. Fixture values only. */

const KNOWN_PHONE = "+216 98 000 001"; // Sami T., fixture
const PASSWORD = "fastgo-demo-2026"; // fixture password, mock only
const NEW_PHONE = "+216 55 123 456";

const input = (page: Page, name: string) => page.locator(`main input[name="${name}"]`);
const session = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("fg.mock.session") ?? "null"));
const codeBox = (page: Page) => page.locator('main input[autocomplete="one-time-code"]');
const submit = (page: Page) => page.locator('main button[type="submit"]').last();

async function signUp(page: Page, locale: string, phone = NEW_PHONE) {
  await openForm(page, `/${locale}/inscription`);
  await input(page, "name").fill("Nour H.");
  await input(page, "phone").fill(phone);
  await input(page, "password").fill("long-enough-pass");
  await input(page, "terms").check();
  await submit(page).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/code$`));
}

async function googleNew(page: Page, locale: string) {
  await openForm(page, `/${locale}/connexion`);
  await page.locator("main button").filter({ hasText: "Google" }).first().click();
  await page.getByRole("button", { name: /Amel B\./ }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/google-telephone$`));
}

async function resetFlow(page: Page, locale: string) {
  await openForm(page, `/${locale}/mot-de-passe`);
  await input(page, "phone").fill(KNOWN_PHONE);
  await submit(page).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/code$`));
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/mot-de-passe/nouveau$`));
}

// ── Every page in fr and ar at 1440 and 360 px ───────────────────────────────────────────────
const PAGES: {
  ref: string;
  path: string;
  reach?: (page: Page, locale: string) => Promise<void>;
}[] = [
  { ref: "W18-Connexion", path: "/connexion" },
  { ref: "W19-Inscription", path: "/inscription" },
  { ref: "W20-Code", path: "/code", reach: (page, locale) => signUp(page, locale) },
  { ref: "W21-MotDePasse", path: "/mot-de-passe" },
  { ref: "W21b-NouveauMotDePasse", path: "/mot-de-passe/nouveau", reach: resetFlow },
  { ref: "W22-GooglePhone", path: "/google-telephone", reach: googleNew },
];

for (const entry of PAGES) {
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      test(`${entry.ref} /${locale.code}${entry.path} at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.clock.install({ time: MORNING });
        if (entry.reach) await entry.reach(page, locale.code);
        else await page.goto(`/${locale.code}${entry.path}`);
        await expect(page).toHaveURL(new RegExp(`/${locale.code}${entry.path}$`));
        await checkPage(page, locale, `${entry.ref}-${locale.code}-${viewport.width}`);
      });
    }
  }
}

// ── Sign-in (W18), ?next= (decision 17) ──────────────────────────────────────────────────────
test("sign-in: a wrong password and an unknown account get the same message (decision 16)", async ({
  page,
}) => {
  const messages: string[] = [];
  for (const [identifier, password] of [
    [KNOWN_PHONE, "wrong-password"],
    ["+216 55 999 999", PASSWORD],
    ["personne@example.tn", PASSWORD],
  ] as const) {
    await openForm(page, "/fr/connexion");
    await input(page, "identifier").fill(identifier);
    await input(page, "password").fill(password);
    await submit(page).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible();
    messages.push((await alert.textContent()) ?? "");
    await expect(page).toHaveURL(/\/fr\/connexion$/);
  }
  expect(new Set(messages).size).toBe(1);
  expect(messages[0]).toContain("Identifiant ou mot de passe incorrect.");
});

test("sign-in goes to /compte by default, to a path of this site, never to an external URL", async ({
  page,
  baseURL,
}) => {
  for (const [next, expected] of [
    [null, /\/fr\/compte$/],
    ["https://evil.example/steal", /\/fr\/compte$/],
    ["//evil.example", /\/fr\/compte$/],
    ["/\\evil.example", /\/fr\/compte$/],
    // The normalized path must not become "//host" (PR #5 review, item 11).
    ["/fr//evil.example", /\/fr\/compte$/],
    ["/..//evil.example", /\/fr\/compte$/],
    ["/%2e%2e//evil.example", /\/fr\/compte$/],
    ["/suivi?n=FG-7K4M-2QXP", /\/fr\/suivi\?n=FG-7K4M-2QXP$/],
  ] as const) {
    await openForm(page, `/fr/connexion${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    await input(page, "identifier").fill(KNOWN_PHONE);
    await input(page, "password").fill(PASSWORD);
    await submit(page).click();
    await expect(page).toHaveURL(expected);
    expect(new URL(page.url()).host).toBe(new URL(baseURL ?? "").host);
    await page.evaluate(() => localStorage.removeItem("fg.mock.session"));
  }
});

test("/compte is a noindex page", async ({ page }) => {
  await openForm(page, "/fr/connexion");
  await input(page, "identifier").fill(KNOWN_PHONE);
  await input(page, "password").fill(PASSWORD);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("the session keeps only id, user, role, kind, contract, verified flag and the masked phone", async ({
  page,
}) => {
  await openForm(page, "/fr/connexion");
  await input(page, "identifier").fill(KNOWN_PHONE);
  await input(page, "password").fill(PASSWORD);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/compte$/);
  const stored = await session(page);
  expect(Object.keys(stored).sort()).toEqual([
    "accountId",
    "contract",
    "kind",
    "maskedPhone",
    "phoneVerified",
    "role",
    "userId",
  ]);
  expect(stored.maskedPhone).toBe("+216 98 ••• 001");
  const everything = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(everything).not.toContain(PASSWORD);
  expect(everything).not.toContain(FIRST_CODE);
});

// ── Sign-up (W19) and the code (W20) ─────────────────────────────────────────────────────────
test("sign-up: the right code creates the account and signs in; nothing personal in the URL", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await signUp(page, "fr");
  await expect(page.getByText("+216 55 ••• 456")).toBeVisible();
  await expect(codeBox(page)).toHaveAttribute("inputmode", "numeric");
  await expect(codeBox(page)).toHaveAttribute("dir", "ltr");
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/compte$/);
  expect((await session(page)).kind).toBe("customer");
  expect(decodeURIComponent(page.url())).not.toMatch(/55|Nour|long-enough/);
});

test("code: wrong code counts down, then locks after 5; the right code no longer works while locked", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await signUp(page, "fr");
  for (const left of [4, 3, 2, 1]) {
    await codeBox(page).fill("000000");
    await submit(page).click();
    await expect(page.getByText(`Code incorrect. Il reste ${left} essai`)).toBeVisible();
  }
  await codeBox(page).fill("000000");
  await submit(page).click();
  await expect(page.getByText(/Trop d'essais\. Réessayez à 09\s?h\s?45/)).toBeVisible();
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page.getByText(/Trop d'essais/)).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/code$/);
});

test("code: an expired code is refused; the resend waits 60 s and replaces the old code", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await signUp(page, "fr");
  await expect(page.getByText(/Renvoyer dans \d+ s/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Renvoyer le code" })).toHaveCount(0);

  await page.clock.fastForward("05:01");
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page.getByText("Ce code a expiré. Demandez-en un nouveau.")).toBeVisible();

  await page.getByRole("button", { name: "Renvoyer le code" }).click();
  await expect(page.getByText("Nouveau code envoyé.")).toBeVisible();
  await codeBox(page).fill(FIRST_CODE); // the old code
  await submit(page).click();
  await expect(page.getByText(/Code incorrect/)).toBeVisible();
  await codeBox(page).fill(SECOND_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/compte$/);
});

test("sign-up with a phone that has an account: 'sign in instead', only after the right code (R101)", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await signUp(page, "fr", KNOWN_PHONE);
  // Before the code nothing tells whether the phone has an account.
  await expect(page.getByText("Ce numéro a déjà un compte.")).toHaveCount(0);
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page.getByText("Ce numéro a déjà un compte.")).toBeVisible();
  expect(await session(page)).toBeNull();
});

test("a reload on /code forgets the sign-up (the password is never stored) and goes back to W19", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await signUp(page, "fr");
  await page.reload();
  await expect(page).toHaveURL(/\/fr\/inscription$/);
});

// ── Forgotten password (W21) and the proposed new-password step ──────────────────────────────
test("forgotten password: same next step for a known and an unknown phone, then a new password", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  for (const phone of ["+216 55 999 999", KNOWN_PHONE]) {
    await openForm(page, "/fr/mot-de-passe");
    await input(page, "phone").fill(phone);
    await submit(page).click();
    await expect(page).toHaveURL(/\/fr\/code$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Saisissez le code reçu");
  }
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/mot-de-passe\/nouveau$/);
  await input(page, "password").fill("short");
  await submit(page).click();
  await expect(page.getByText("10 caractères au minimum.")).toBeVisible();
  await input(page, "password").fill("a-new-long-password");
  await submit(page).click();
  await expect(
    page.getByText("Mot de passe enregistré. Vous pouvez vous connecter."),
  ).toBeVisible();
});

// ── Google (W22, R103) ───────────────────────────────────────────────────────────────────────
test("Google, new e-mail: phone on W22, SMS code, then signed in", async ({ page }) => {
  await page.clock.install({ time: MORNING });
  await googleNew(page, "fr");
  await expect(page.getByText("amel.b@example.tn, connecté avec Google")).toBeVisible();
  await input(page, "phone").fill(NEW_PHONE);
  await input(page, "terms").check();
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/code$/);
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/compte$/);
  expect(await session(page)).toMatchObject({ kind: "customer", phoneVerified: true });
});

test("Google, known e-mail: e-mail code first, then the phone is still required (R103)", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await openForm(page, "/fr/connexion");
  await page.locator("main button").filter({ hasText: "Google" }).first().click();
  await page.getByRole("button", { name: /Sami T\./ }).click();
  await expect(page).toHaveURL(/\/fr\/google-telephone$/);
  await expect(input(page, "phone")).toHaveCount(0);
  await page.getByRole("button", { name: "Recevoir le code par e-mail" }).click();
  await expect(page).toHaveURL(/\/fr\/code$/);
  await expect(page.getByText("s•••@example.tn")).toBeVisible();
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();

  await expect(page).toHaveURL(/\/fr\/google-telephone$/);
  await input(page, "phone").fill(KNOWN_PHONE);
  await input(page, "terms").check();
  await submit(page).click();
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/compte$/);
  expect((await session(page)).accountId).toBe("acc-customer");
});

test("?next= is kept through W18, W22 and W20, and the draft comes back intact", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await openForm(page, "/fr/connexion?next=%2Fsuivi");
  await page.locator("main button").filter({ hasText: "Google" }).first().click();
  await page.getByRole("button", { name: /Amel B\./ }).click();
  await expect(page).toHaveURL(/\/fr\/google-telephone\?next=%2Fsuivi$/);
  await input(page, "phone").fill(NEW_PHONE);
  await input(page, "terms").check();
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/code\?next=%2Fsuivi$/);
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/suivi$/);
});

// ── PR #5 review, group B ────────────────────────────────────────────────────────────────────
const sessionWrites = (page: Page) =>
  page.evaluate(() => Number(sessionStorage.getItem("test.sessionWrites") ?? "0"));

test("sign-in: a double click on the button signs in once (item 17)", async ({ page }) => {
  // Counts the writes of the mock session (one per successful sign-in call).
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && key === "fg.mock.session") {
        const count = Number(window.sessionStorage.getItem("test.sessionWrites") ?? "0");
        setItem.call(window.sessionStorage, "test.sessionWrites", String(count + 1));
      }
      return setItem.call(this, key, value);
    };
  });
  await openForm(page, "/fr/connexion");
  await input(page, "identifier").fill(KNOWN_PHONE);
  await input(page, "password").fill(PASSWORD);
  await submit(page).dblclick();
  await expect(page).toHaveURL(/\/fr\/compte$/);
  expect(await sessionWrites(page)).toBe(1);
});

test("sign-up with an e-mail: the account is created without it and the message is the same, taken or not (item 13)", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  const texts: string[] = [];
  for (const [phone, email] of [
    ["+216 55 123 456", "sami.t@example.tn"], // e-mail of a fixture account
    ["+216 55 123 457", "nouveau@example.tn"],
  ] as const) {
    await page.evaluate(() => localStorage.removeItem("fg.mock.session")).catch(() => {});
    await openForm(page, "/fr/inscription");
    await input(page, "name").fill("Nour H.");
    await input(page, "phone").fill(phone);
    await input(page, "email").fill(email);
    await input(page, "password").fill("long-enough-pass");
    await input(page, "terms").check();
    await submit(page).click();
    await expect(page).toHaveURL(/\/fr\/code$/);
    await codeBox(page).fill(FIRST_CODE);
    await submit(page).click();
    const notice = page.locator("main").getByText(/vous pourrez le confirmer plus tard/);
    await expect(notice).toBeVisible();
    await expect(page.getByText("Cet e-mail a déjà un compte")).toHaveCount(0);
    texts.push((await notice.textContent()) ?? "");
    expect((await session(page))?.kind).toBe("customer");
    const accounts = await page.evaluate(() =>
      Object.values(JSON.parse(localStorage.getItem("fg.mock.accounts") ?? "{}")),
    );
    // No e-mail is attached without a code sent to it.
    expect(accounts.map((a) => (a as { email: string | null }).email)).not.toContain(email);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/fr\/compte$/);
  }
  expect(new Set(texts).size).toBe(1);
});

test("Google: a second tab cannot skip the e-mail code of a known e-mail (R103, item 12)", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  // Tab 1: a new Google e-mail, phone of the known account, up to the SMS code.
  await googleNew(page, "fr");
  await input(page, "phone").fill(KNOWN_PHONE);
  await input(page, "terms").check();
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/code$/);
  // Tab 2: the known Google e-mail replaces the sign-in in progress, e-mail not confirmed.
  const other = await page.context().newPage();
  await other.goto("/fr/connexion");
  await other.locator("main button").filter({ hasText: "Google" }).first().click();
  await other.getByRole("button", { name: /Sami T\./ }).click();
  await expect(other).toHaveURL(/\/fr\/google-telephone$/);
  // Tab 1: the right SMS code must not sign in to the known account.
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/google-telephone$/);
  await expect(page.getByRole("button", { name: "Recevoir le code par e-mail" })).toBeVisible();
  expect(await session(page)).toBeNull();
});

test("Google, known e-mail: another phone than the account's is refused (item 15)", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await openForm(page, "/fr/connexion");
  await page.locator("main button").filter({ hasText: "Google" }).first().click();
  await page.getByRole("button", { name: /Sami T\./ }).click();
  await page.getByRole("button", { name: "Recevoir le code par e-mail" }).click();
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/google-telephone$/);
  await input(page, "phone").fill(NEW_PHONE);
  await input(page, "terms").check();
  await submit(page).click();
  await codeBox(page).fill(FIRST_CODE);
  await submit(page).click();
  await expect(
    page.locator("main").getByText("Ce numéro n'est pas celui de votre compte."),
  ).toBeVisible();
  expect(await session(page)).toBeNull();
  const accounts = await page.evaluate(() => localStorage.getItem("fg.mock.accounts") ?? "");
  expect(accounts).not.toContain("+21655123456");
});

test("a password reset right after a sign-up code gets its own code and works (item 16)", async ({
  page,
}) => {
  await page.clock.install({ time: MORNING });
  await signUp(page, "fr", KNOWN_PHONE);
  await expect(page.getByText(/Renvoyer dans \d+ s/)).toBeVisible(); // the sign-up code was sent
  await openForm(page, "/fr/mot-de-passe");
  await input(page, "phone").fill(KNOWN_PHONE);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/code$/);
  await codeBox(page).fill(SECOND_CODE); // the second code sent to this phone
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/mot-de-passe\/nouveau$/);
  await input(page, "password").fill("a-new-long-password");
  await submit(page).click();
  await expect(
    page.getByText("Mot de passe enregistré. Vous pouvez vous connecter."),
  ).toBeVisible();
});
