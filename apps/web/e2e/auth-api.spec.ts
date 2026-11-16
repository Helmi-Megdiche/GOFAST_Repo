import { expect, test, type Page, type Route } from "@playwright/test";
import { LOCALES, VIEWPORTS, checkPage } from "./helpers";

/**
 * Sign-in, sign-up, phone code and password reset on the API adapter (#20, PR 4a).
 * Built with NEXT_PUBLIC_API_DOMAINS=auth (playwright.api.config.ts, port 3200). Every /v1 call is
 * answered here with page.route: no API runs. Fake names and phones only.
 */

const PHONE = "+216 55 123 456";
const PHONE_E164 = "+21655123456";
const PASSWORD = "long-enough-pass";
const CHECK_ID = "5b0f6a1e-3c5d-4f43-9a58-2a7b6a0c9d11";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "abort";
type Call = { method: string; path: string; body: unknown };
type Handler = (call: Call) => Reply;

const me = (over: Record<string, unknown> = {}) => ({
  account_id: "acc-customer",
  user_id: "acc-customer",
  kind: "customer",
  role: null,
  contract: null,
  phone_verified: true,
  name: "Nour H.",
  phone: PHONE_E164,
  email: null,
  google: false,
  locale: "fr",
  notifications: {},
  ...over,
});
const refused = (reason: string, details?: Record<string, number>) => ({
  error: {
    code: "RULE_REFUSED",
    message: "SERVER TEXT, never shown",
    fields: [{ name: "x", reason, ...(details ? { details } : {}) }],
    trace_id: "tr-e2e",
  },
});

/** A fake /v1: what each route answers, every call recorded, anything not planned is a failure. */
async function fakeApi(page: Page) {
  const state = {
    me: null as ReturnType<typeof me> | null,
    calls: [] as Call[],
    unexpected: [] as string[],
    on: {} as Record<string, Handler>,
  };
  const defaults: Record<string, Handler> = {
    "GET /v1/me": () => (state.me ? { status: 200, body: state.me } : { status: 401 }),
    "DELETE /v1/sessions": () => {
      state.me = null;
      return { status: 204 };
    },
    "POST /v1/phone-checks": () => ({
      status: 202,
      body: {
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        resend_at: new Date(Date.now() + 60_000).toISOString(),
      },
    }),
    "POST /v1/phone-checks/verify": () => ({ status: 200, body: { phone_check_id: CHECK_ID } }),
  };
  await page.route("**/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const key = `${request.method()} ${path}`;
    const call: Call = {
      method: request.method(),
      path,
      body: request.postData() ? JSON.parse(request.postData()!) : null,
    };
    state.calls.push(call);
    const handler = state.on[key] ?? defaults[key];
    if (!handler) {
      state.unexpected.push(key);
      return route.fulfill({ status: 501 });
    }
    const reply = handler(call);
    if (reply === "abort") return route.abort("failed");
    return route.fulfill({
      status: reply.status,
      contentType: "application/json",
      headers: reply.headers,
      body: reply.body === undefined ? undefined : JSON.stringify(reply.body),
    });
  });
  return {
    state,
    calls: (key: string) => state.calls.filter((call) => `${call.method} ${call.path}` === key),
  };
}

const input = (page: Page, name: string) => page.locator(`main input[name="${name}"]`);
const codeBox = (page: Page) => page.locator('main input[autocomplete="one-time-code"]');
const submit = (page: Page) => page.locator('main button[type="submit"]').last();
const copy = (page: Page) => page.evaluate(() => localStorage.getItem("fg.mock.session"));

/** RV-10: the form works only once React is attached. Wait for it, not for a timer. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => {
    const form = document.querySelector("main form");
    return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
  });
}

async function fillSignUp(page: Page, locale = "fr") {
  await open(page, `/${locale}/inscription`);
  await input(page, "name").fill("Nour H.");
  await input(page, "phone").fill(PHONE);
  await input(page, "password").fill(PASSWORD);
  await input(page, "terms").check();
  await submit(page).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/code$`));
}

async function enterCode(page: Page, code = "123456") {
  await page.waitForFunction(() => {
    const box = document.querySelector('main input[autocomplete="one-time-code"]');
    return !!box && Object.keys(box).some((key) => key.startsWith("__reactProps"));
  });
  await codeBox(page).fill(code);
  await submit(page).click();
}

async function signIn(page: Page, path = "/fr/connexion") {
  await open(page, path);
  await input(page, "identifier").fill(PHONE);
  await input(page, "password").fill(PASSWORD);
  await submit(page).click();
}

const noUnexpected = (api: Awaited<ReturnType<typeof fakeApi>>) =>
  expect(api.state.unexpected, "/v1 calls nobody planned").toEqual([]);

// ── Pages: api mode keeps lang, dir, no overflow, axe ────────────────────────────────────────
for (const path of ["/connexion", "/inscription"]) {
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      test(`api mode ${path} /${locale.code} at ${viewport.width}px`, async ({ page }) => {
        await fakeApi(page);
        await page.setViewportSize(viewport);
        await open(page, `/${locale.code}${path}`);
        await checkPage(
          page,
          locale,
          `api${path.replace("/", "-")}-${locale.code}-${viewport.width}`,
        );
      });
    }
  }
}

test("api mode: no remember box and no Google on W18 and W19", async ({ page }) => {
  await fakeApi(page);
  for (const path of ["/fr/connexion", "/fr/inscription"]) {
    await open(page, path);
    await expect(page.getByRole("checkbox", { name: "Rester connecté" })).toHaveCount(0);
    await expect(page.locator("main button").filter({ hasText: "Google" })).toHaveCount(0);
  }
});

// ── Sign-in ──────────────────────────────────────────────────────────────────────────────────
test("sign-in: sends the identifier and password, keeps only a display copy, opens /compte", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/sessions"] = () => {
    api.state.me = me();
    return { status: 201, body: api.state.me };
  };
  await signIn(page);
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  expect(api.calls("POST /v1/sessions")[0]?.body).toEqual({
    identifier: PHONE,
    password: PASSWORD,
  });
  const stored = JSON.parse((await copy(page)) ?? "null");
  expect(stored.accountId).toBe("acc-customer");
  expect(JSON.stringify(stored)).not.toMatch(/Nour|55123456|long-enough/);
  noUnexpected(api);
});

test("sign-in: ?next= keeps a path of this site and drops anything else", async ({
  page,
  baseURL,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/sessions"] = () => {
    api.state.me = me();
    return { status: 201, body: api.state.me };
  };
  for (const [next, expected] of [
    ["https://evil.example/steal", /\/fr\/compte$/],
    ["//evil.example", /\/fr\/compte$/],
    ["/suivi?n=FG-7K4M-2QXP", /\/fr\/suivi\?n=FG-7K4M-2QXP$/],
  ] as const) {
    await signIn(page, `/fr/connexion?next=${encodeURIComponent(next)}`);
    await expect(page).toHaveURL(expected);
    expect(new URL(page.url()).host).toBe(new URL(baseURL ?? "").host);
    api.state.me = null;
    await page.evaluate(() => localStorage.clear());
  }
});

test("sign-in: a refusal shows one message, the same for any reason, and no session", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/sessions"] = () => ({
    status: 401,
    body: { error: { code: "UNAUTHENTICATED", message: "SERVER TEXT", trace_id: "tr-e2e" } },
  });
  await signIn(page);
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
  await expect(page.getByText("SERVER TEXT")).toHaveCount(0);
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  expect(await copy(page)).toBeNull();
});

test("sign-in: 429 shows one countdown from Retry-After", async ({ page }) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/sessions"] = () => ({
    status: 429,
    headers: { "retry-after": "30" },
    body: { error: { code: "RATE_LIMITED", message: "SERVER TEXT", trace_id: "tr-e2e" } },
  });
  await signIn(page);
  const message = page.getByText(/Trop de tentatives\. Réessayez dans \d+ s\./);
  await expect(message).toBeVisible();
  const seconds = Number(/dans (\d+) s/.exec((await message.textContent()) ?? "")?.[1]);
  expect(seconds).toBeGreaterThan(0);
  expect(seconds).toBeLessThanOrEqual(30);
  await expect(page.getByText("SERVER TEXT")).toHaveCount(0);
});

test("sign-in: a cut connection says the service is unavailable, not a wrong password", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/sessions"] = () => "abort";
  await signIn(page);
  await expect(page.getByText(/Le service ne répond pas pour le moment/)).toBeVisible();
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toHaveCount(0);
});

// ── The guard and sign-out ───────────────────────────────────────────────────────────────────
test("guard: /compte with a refused cookie goes to sign-in with ?next=", async ({ page }) => {
  const api = await fakeApi(page);
  // A stale display copy must not open the page: the cookie decides.
  await page.addInitScript(() =>
    localStorage.setItem(
      "fg.mock.session",
      JSON.stringify({
        accountId: "acc-customer",
        userId: "acc-customer",
        role: null,
        kind: "customer",
        contract: null,
        phoneVerified: true,
        maskedPhone: "+216 55 ••• 456",
      }),
    ),
  );
  await page.goto("/fr/compte");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fcompte$/);
  expect(api.calls("GET /v1/me").length).toBeGreaterThan(0);
  expect(await copy(page)).toBeNull();
});

test("sign-out: sends DELETE /v1/sessions, clears the copy, goes to sign-in", async ({ page }) => {
  const api = await fakeApi(page);
  api.state.me = me();
  await page.goto("/fr/compte");
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  expect(await copy(page)).not.toBeNull();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  expect(api.calls("DELETE /v1/sessions")).toHaveLength(1);
  expect(await copy(page)).toBeNull();
});

// ── Sign-up and the code ─────────────────────────────────────────────────────────────────────
test("sign-up: the code step sends the phone, then the account, with e-mail null", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/accounts"] = () => {
    api.state.me = me();
    return { status: 201, body: api.state.me };
  };
  await fillSignUp(page);
  await expect.poll(() => api.calls("POST /v1/phone-checks").length).toBe(1);
  expect(api.calls("POST /v1/phone-checks")[0]?.body).toEqual({
    phone: PHONE_E164,
    purpose: "signUp",
  });
  await enterCode(page);
  await expect(page).toHaveURL(/\/fr\/compte$/);
  expect(api.calls("POST /v1/phone-checks/verify")[0]?.body).toEqual({
    phone: PHONE_E164,
    purpose: "signUp",
    code: "123456",
  });
  expect(api.calls("POST /v1/accounts")[0]?.body).toMatchObject({
    kind: "customer",
    name: "Nour H.",
    phone: PHONE_E164,
    phone_check_id: CHECK_ID,
    email: null,
    terms_accepted: true,
  });
  expect(decodeURIComponent(page.url())).not.toMatch(/55123456|Nour|long-enough/);
  noUnexpected(api);
});

test("code: wrong shows the attempts left, locked shows a time, expired asks for a new code", async ({
  page,
}) => {
  const api = await fakeApi(page);
  await fillSignUp(page);

  api.state.on["POST /v1/phone-checks/verify"] = () => ({
    status: 422,
    body: refused("wrong", { attempts_left: 4 }),
  });
  await enterCode(page, "000000");
  await expect(page.getByText("Code incorrect. Il reste 4 essais.")).toBeVisible();

  api.state.on["POST /v1/phone-checks/verify"] = () => ({
    status: 429,
    headers: { "retry-after": "600" },
    body: { error: { code: "RATE_LIMITED", message: "SERVER TEXT", trace_id: "tr-e2e" } },
  });
  await enterCode(page, "000000");
  await expect(page.getByText(/Trop d'essais\. Réessayez à \d{2}\s?h\s?\d{2}\./)).toBeVisible();

  api.state.on["POST /v1/phone-checks/verify"] = () => ({
    status: 422,
    body: refused("expired"),
  });
  await enterCode(page, "111111");
  await expect(page.getByText("Ce code a expiré. Demandez-en un nouveau.")).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/code$/);
});

test("sign-up with a phone that has an account: said only after the right code (R101)", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/accounts"] = () => ({ status: 422, body: refused("phoneTaken") });
  await fillSignUp(page);
  await expect(page.getByText("Ce numéro a déjà un compte.")).toHaveCount(0);
  await enterCode(page);
  await expect(page.getByText("Ce numéro a déjà un compte.")).toBeVisible();
  expect(await copy(page)).toBeNull();
});

test("sign-up: a lost answer after the account was created still signs in (change A)", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/accounts"] = () => {
    api.state.me = me(); // the server created the account and the cookie, the answer is lost
    return "abort";
  };
  await fillSignUp(page);
  await enterCode(page);
  await expect(page).toHaveURL(/\/fr\/compte$/);
  expect(api.calls("GET /v1/me").length).toBeGreaterThan(0);
  expect(api.calls("POST /v1/accounts")).toHaveLength(1);
});

test("sign-up: a lost answer with no account says unavailable, and a retry uses the same proof", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/accounts"] = () => "abort";
  await fillSignUp(page);
  await enterCode(page);
  await expect(page.getByText(/Le service ne répond pas pour le moment/)).toBeVisible();
  expect(await copy(page)).toBeNull();

  api.state.on["POST /v1/accounts"] = () => {
    api.state.me = me();
    return { status: 201, body: api.state.me };
  };
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page).toHaveURL(/\/fr\/compte$/);
  expect(api.calls("POST /v1/phone-checks/verify")).toHaveLength(1);
  const bodies = api
    .calls("POST /v1/accounts")
    .map((call) => call.body as { phone_check_id: string });
  expect(bodies.map((body) => body.phone_check_id)).toEqual([CHECK_ID, CHECK_ID]);
});

// ── Forgotten password ───────────────────────────────────────────────────────────────────────
async function reachNewPassword(page: Page, phone: string) {
  await open(page, "/fr/mot-de-passe");
  await input(page, "phone").fill(phone);
  await submit(page).click();
  await expect(page).toHaveURL(/\/fr\/code$/);
  await enterCode(page);
  await expect(page).toHaveURL(/\/fr\/mot-de-passe\/nouveau$/);
}

test("reset: a known and an unknown phone get the same screens, then the new password is sent", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/password-resets"] = () => ({ status: 204 });
  const seen: string[] = [];
  for (const phone of ["+216 55 999 999", PHONE]) {
    await open(page, "/fr/mot-de-passe");
    await input(page, "phone").fill(phone);
    await submit(page).click();
    await expect(page).toHaveURL(/\/fr\/code$/);
    seen.push(await page.getByRole("heading", { level: 1 }).innerText());
  }
  expect(new Set(seen).size).toBe(1);
  await expect.poll(() => api.calls("POST /v1/phone-checks").length).toBe(2);
  expect(
    api.calls("POST /v1/phone-checks").map((call) => (call.body as { purpose: string }).purpose),
  ).toEqual(["reset", "reset"]);
  await enterCode(page);
  await expect(page).toHaveURL(/\/fr\/mot-de-passe\/nouveau$/);
  await input(page, "password").fill("a-new-long-password");
  await submit(page).click();
  await expect(
    page.getByText("Mot de passe enregistré. Vous pouvez vous connecter."),
  ).toBeVisible();
  expect(api.calls("POST /v1/password-resets")[0]?.body).toEqual({
    phone: PHONE_E164,
    phone_check_id: CHECK_ID,
    new_password: "a-new-long-password",
  });
  noUnexpected(api);
});

test("reset: a double click sends one request, so the proof is not spent twice", async ({
  page,
}) => {
  const api = await fakeApi(page);
  let n = 0;
  // A second call with the same proof would be refused: 204 first, then 422.
  api.state.on["POST /v1/password-resets"] = () =>
    ++n === 1 ? { status: 204 } : { status: 422, body: refused("notVerified") };
  await reachNewPassword(page, PHONE);
  await input(page, "password").fill("a-new-long-password");
  await submit(page).dblclick();
  await expect(
    page.getByText("Mot de passe enregistré. Vous pouvez vous connecter."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/mot-de-passe\/nouveau$/);
  expect(api.calls("POST /v1/password-resets")).toHaveLength(1);
});

test("reset: a lost answer, then a 422 on the retry says the password may already be changed", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/password-resets"] = () => "abort";
  await reachNewPassword(page, PHONE);
  await input(page, "password").fill("a-new-long-password");
  await submit(page).click();
  await expect(page.getByText(/Le service ne répond pas pour le moment/)).toBeVisible();

  // The first call worked on the server: the proof is spent, so the retry is refused.
  api.state.on["POST /v1/password-resets"] = () => ({ status: 422, body: refused("notVerified") });
  await submit(page).click();
  await expect(page.getByText(/Votre mot de passe a peut-être déjà été changé/)).toBeVisible();
  await expect(page.getByRole("link", { name: /connecter/i }).first()).toBeVisible();
});

test("reset: a 422 with no earlier lost answer is a plain refusal, not 'maybe changed'", async ({
  page,
}) => {
  const api = await fakeApi(page);
  api.state.on["POST /v1/password-resets"] = () => ({ status: 422, body: refused("notVerified") });
  await reachNewPassword(page, PHONE);
  await input(page, "password").fill("a-new-long-password");
  await submit(page).click();
  await expect(page.getByText(/déjà été changé/)).toHaveCount(0);
});
