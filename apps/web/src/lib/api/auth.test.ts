import { beforeEach, describe, expect, it, vi } from "vitest";
import { CODE_RESEND_DELAY_MS } from "@fastgo/domain";
import { SESSION_KEY, getSession, setSession, type Session } from "../data/session";
import { useMemoryStorage } from "../storage";
import { createApiAuth } from "./auth";
import { createApiClient } from "./client";

const NOW = Date.parse("2026-11-16T09:00:00Z");
const CHECK_ID = "5b0f6a1e-3c5d-4f43-9a58-2a7b6a0c9d11";
const PHONE = "+21620123456";

const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const noBody = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers });
const err = (
  code: string,
  fields: { name: string; reason: string; details?: Record<string, number> }[] = [],
) => ({ error: { code, message: "SERVER TEXT", fields, trace_id: "tr-9" } });
const refused = (name: string, reason: string, details?: Record<string, number>) =>
  err("RULE_REFUSED", [{ name, reason, ...(details ? { details } : {}) }]);

const me = (over: Record<string, unknown> = {}) => ({
  account_id: "acc-1",
  user_id: "acc-1",
  kind: "customer",
  role: null,
  contract: null,
  phone_verified: true,
  name: "Amel Test",
  phone: PHONE,
  email: null,
  google: false,
  locale: "ar",
  notifications: {},
  ...over,
});

function setup(respond: (request: Request) => Promise<Response> | Response) {
  const fetchImpl = vi.fn(async (request: Request) => respond(request));
  const client = createApiClient({
    fetch: fetchImpl,
    baseUrl: "http://web.test",
    clearSessionOn401: true,
  });
  const auth = createApiAuth(client, { now: () => NOW });
  const sent = () =>
    (fetchImpl.mock.calls as unknown as [Request][]).map(([request]) => ({
      method: request.method,
      path: new URL(request.url).pathname,
      request,
    }));
  return { fetchImpl, auth, sent };
}

const iso = (ms: number) => new Date(ms).toISOString();
const signUpInput = {
  kind: "customer" as const,
  name: "Amel Test",
  phone: "20 123 456",
  password: "motdepasse-ok",
  locale: "fr" as const,
};

let store: Map<string, string>;
beforeEach(() => {
  store = useMemoryStorage();
});

describe("api auth adapter: sign-in (W18)", () => {
  it("201 maps Me to the session copy, with the masked phone and the account language", async () => {
    const { auth, sent } = setup(() => json(201, me()));
    const result = await auth.signIn("20 123 456", "secret-1");
    expect(result).toEqual({
      status: "ok",
      locale: "ar",
      session: {
        accountId: "acc-1",
        userId: "acc-1",
        role: null,
        kind: "customer",
        contract: null,
        phoneVerified: true,
        maskedPhone: "+216 20 ••• 456",
      },
    });
    expect(getSession()).toEqual((result as { session: Session }).session);
    const [call] = sent();
    expect(call?.path).toBe("/v1/sessions");
    expect(call?.method).toBe("POST");
    expect(call?.request.headers.get("content-type")).toContain("application/json");
    expect(call?.request.headers.get("authorization")).toBeNull();
    expect(await call?.request.clone().json()).toEqual({
      identifier: "20 123 456",
      password: "secret-1",
    });
  });

  it("keeps the merchant role and contract, never the full phone", async () => {
    const { auth } = setup(() =>
      json(201, me({ kind: "merchant", role: "user", contract: "validated" })),
    );
    const result = await auth.signIn("a@example.tn", "x");
    expect(result).toMatchObject({
      status: "ok",
      session: { kind: "merchant", role: "user", contract: "validated" },
    });
    expect(store.size).toBeGreaterThan(0); // the check below must be able to fail
    for (const value of store.values()) expect(value).not.toContain("20123456");
  });

  it("a wrong password and an unknown account give the same result", async () => {
    const wrong = setup(() =>
      json(401, err("AUTH_REQUIRED", [{ name: "x", reason: "invalidCredentials" }])),
    );
    const unknown = setup(() =>
      json(401, err("AUTH_REQUIRED", [{ name: "x", reason: "invalidCredentials" }])),
    );
    const a = await wrong.auth.signIn("20 123 456", "bad");
    const b = await unknown.auth.signIn("99 999 999", "bad");
    expect(a).toEqual({ status: "invalidCredentials" });
    expect(b).toEqual(a);
    expect(getSession()).toBeNull();
  });

  it("a staff account is refused as a customer session and its cookie is dropped", async () => {
    const { auth, sent } = setup((request) =>
      request.method === "DELETE" ? noBody(204) : json(201, me({ kind: "staff", role: "ops" })),
    );
    expect(await auth.signIn("staff@example.tn", "x")).toEqual({ status: "invalidCredentials" });
    expect(getSession()).toBeNull();
    expect(sent().map((call) => call.method)).toEqual(["POST", "DELETE"]);
  });
});

describe("api auth adapter: 429, 5xx and cuts for every write", () => {
  const calls: [string, (a: ReturnType<typeof setup>["auth"]) => Promise<{ status: string }>][] = [
    ["signIn", (a) => a.signIn("20 123 456", "x")],
    ["sendCode", (a) => a.sendCode("20 123 456", "signUp")],
    ["signUp", (a) => a.signUp(signUpInput, CHECK_ID)],
    ["resetPassword", (a) => a.resetPassword("20 123 456", CHECK_ID, "motdepasse-ok")],
  ];

  it.each(calls)("%s: 429 with Retry-After 30 gives one wait with retryAt", async (_name, run) => {
    const { auth } = setup(() => json(429, err("TOO_MANY_ATTEMPTS"), { "retry-after": "30" }));
    expect(await run(auth)).toEqual({ status: "wait", retryAt: iso(NOW + 30_000) });
  });

  it.each(calls)("%s: 429 without Retry-After uses the resend delay", async (_name, run) => {
    const { auth } = setup(() => json(429, err("TOO_MANY_ATTEMPTS")));
    expect(await run(auth)).toEqual({ status: "wait", retryAt: iso(NOW + CODE_RESEND_DELAY_MS) });
  });

  it.each(calls)("%s: 500 and 503 give unavailable, never ok", async (_name, run) => {
    for (const status of [500, 503]) {
      const { auth } = setup(() => json(status, err("INTERNAL_ERROR")));
      expect(await run(auth)).toEqual({ status: "unavailable" });
    }
  });

  it.each(calls.filter(([name]) => name !== "signUp"))(
    "%s: a cut connection gives unavailable",
    async (_name, run) => {
      const { auth } = setup(() => {
        throw new TypeError("offline");
      });
      expect(await run(auth)).toEqual({ status: "unavailable" });
    },
  );
});

describe("api auth adapter: phone code (W20)", () => {
  it("send: 202 gives sent, with the normalized phone and the purpose in the body", async () => {
    const { auth, sent } = setup(() =>
      json(202, { expires_at: "2026-11-16T09:10:00Z", resend_at: "2026-11-16T09:01:00Z" }),
    );
    expect(await auth.sendCode("20 123 456", "reset")).toEqual({
      status: "sent",
      expiresAt: "2026-11-16T09:10:00Z",
      resendAt: "2026-11-16T09:01:00Z",
    });
    const [call] = sent();
    expect(call?.path).toBe("/v1/phone-checks");
    expect(await call?.request.clone().json()).toEqual({ phone: PHONE, purpose: "reset" });
  });

  it("send: 400 gives invalidTarget", async () => {
    const { auth } = setup(() => json(400, err("VALIDATION_FAILED")));
    expect(await auth.sendCode("20 123 456", "signUp")).toEqual({ status: "invalidTarget" });
  });

  it("verify: 200 gives ok with the proof, which is kept out of storage", async () => {
    const map = store;
    const { auth, sent } = setup(() =>
      json(200, { phone_check_id: CHECK_ID, valid_until: "2026-11-16T09:15:00Z" }),
    );
    expect(await auth.verifyCode("20 123 456", "signUp", "123456")).toEqual({
      status: "ok",
      checkId: CHECK_ID,
    });
    expect([...map.values()].join("")).not.toContain(CHECK_ID);
    const [call] = sent();
    expect(call?.path).toBe("/v1/phone-checks/verify");
    expect(await call?.request.clone().json()).toEqual({
      phone: PHONE,
      purpose: "signUp",
      code: "123456",
    });
  });

  it.each([
    ["wrong", { attempts_left: 3 }, { status: "wrong", attemptsLeft: 3 }],
    ["wrong", undefined, { status: "wrong", attemptsLeft: 0 }],
    ["expired", { attempts_left: 4 }, { status: "expired" }],
    ["noCode", undefined, { status: "noCode" }],
  ])("verify: 422 %s %j maps to %j", async (reason, details, expected) => {
    const { auth } = setup(() => json(422, refused("code", reason, details)));
    expect(await auth.verifyCode("20 123 456", "signUp", "000000")).toEqual(expected);
  });

  it("verify: an unknown reason is generic (unavailable), the server text is never returned", async () => {
    const { auth } = setup(() => json(422, refused("code", "somethingNew")));
    const result = await auth.verifyCode("20 123 456", "signUp", "000000");
    expect(result).toEqual({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("SERVER TEXT");
  });

  it("verify: 429 is locked until Retry-After", async () => {
    const { auth } = setup(() => json(429, err("TOO_MANY_ATTEMPTS"), { "retry-after": "900" }));
    expect(await auth.verifyCode("20 123 456", "signUp", "000000")).toEqual({
      status: "locked",
      retryAt: iso(NOW + 900_000),
    });
  });

  it("a known and an unknown phone get the same results for send, verify and reset", async () => {
    const outcomes = async (phone: string) => {
      const answers = [
        json(202, { expires_at: "2026-11-16T09:10:00Z", resend_at: "2026-11-16T09:01:00Z" }),
        json(422, refused("code", "wrong", { attempts_left: 4 })),
        noBody(204),
      ];
      const { auth } = setup(() => answers.shift() as Response);
      return [
        await auth.sendCode(phone, "reset"),
        await auth.verifyCode(phone, "reset", "000000"),
        await auth.resetPassword(phone, CHECK_ID, "motdepasse-ok"),
      ];
    };
    expect(await outcomes("20 123 456")).toEqual(await outcomes("99 999 999"));
  });
});

describe("api auth adapter: sign-up (W19)", () => {
  it("201 creates the session copy; the body has email null, the proof, the terms and the language", async () => {
    const { auth, sent } = setup(() => json(201, me({ locale: "fr" })));
    const result = await auth.signUp(signUpInput, CHECK_ID);
    expect(result).toMatchObject({ status: "created", session: { accountId: "acc-1" } });
    expect(getSession()?.accountId).toBe("acc-1");
    const [call] = sent();
    expect(call?.path).toBe("/v1/accounts");
    expect(await call?.request.clone().json()).toEqual({
      kind: "customer",
      name: "Amel Test",
      phone: PHONE,
      phone_check_id: CHECK_ID,
      email: null,
      password: "motdepasse-ok",
      locale: "fr",
      terms_accepted: true,
    });
  });

  it.each([
    ["phoneTaken", refused("phone", "phoneTaken"), "phoneTaken"],
    ["passwordTooShort", refused("password", "passwordTooShort"), "tooShort"],
    ["a lost or used proof", refused("phone_check_id", "notVerified"), "notVerified"],
  ])("422 %s maps to %s", async (_label, body, status) => {
    const { auth } = setup(() => json(422, body));
    expect(await auth.signUp(signUpInput, CHECK_ID)).toEqual({ status });
  });

  it("without a proof it asks for the code again and sends nothing", async () => {
    const { auth, fetchImpl } = setup(() => json(201, me()));
    expect(await auth.signUp(signUpInput, undefined)).toEqual({ status: "notVerified" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Change A: a lost answer is settled by GET /v1/me; a 200 means the account was created", async () => {
    const { auth, sent } = setup((request) => {
      if (request.method === "POST") throw new TypeError("offline");
      return json(200, me({ locale: "fr" }));
    });
    const result = await auth.signUp(signUpInput, CHECK_ID);
    expect(result).toMatchObject({ status: "created", session: { accountId: "acc-1" } });
    expect(sent().map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /v1/accounts",
      "GET /v1/me",
    ]);
    expect(getSession()?.accountId).toBe("acc-1");
  });

  it("Change A: a lost answer and a 401 on /v1/me gives unavailable", async () => {
    const { auth } = setup((request) => {
      if (request.method === "POST") throw new TypeError("offline");
      return json(401, err("AUTH_REQUIRED"));
    });
    expect(await auth.signUp(signUpInput, CHECK_ID)).toEqual({ status: "unavailable" });
    expect(getSession()).toBeNull();
  });

  it("Change A: a lost answer and a second cut gives unavailable", async () => {
    const { auth } = setup(() => {
      throw new TypeError("offline");
    });
    expect(await auth.signUp(signUpInput, CHECK_ID)).toEqual({ status: "unavailable" });
  });
});

describe("api auth adapter: password reset (W21)", () => {
  it("204 gives ok, body has phone, proof and new password", async () => {
    const { auth, sent } = setup(() => noBody(204));
    expect(await auth.resetPassword("20 123 456", CHECK_ID, "nouveau-mdp-1")).toEqual({
      status: "ok",
    });
    const [call] = sent();
    expect(call?.path).toBe("/v1/password-resets");
    expect(await call?.request.clone().json()).toEqual({
      phone: PHONE,
      phone_check_id: CHECK_ID,
      new_password: "nouveau-mdp-1",
    });
  });

  it("422 passwordTooShort gives tooShort; another 422 gives notVerified", async () => {
    const short = setup(() => json(422, refused("new_password", "passwordTooShort")));
    expect(await short.auth.resetPassword("20 123 456", CHECK_ID, "x")).toEqual({
      status: "tooShort",
    });
    const gone = setup(() => json(422, refused("phone_check_id", "notVerified")));
    expect(await gone.auth.resetPassword("20 123 456", CHECK_ID, "motdepasse-ok")).toEqual({
      status: "notVerified",
    });
  });

  it("Change A: a retry with the same proof that gets 422 after an unavailable says maybeChanged", async () => {
    const answers: (() => Response)[] = [
      () => {
        throw new TypeError("offline");
      },
      () => json(422, refused("phone_check_id", "notVerified")),
    ];
    const { auth } = setup(() => answers.shift()!());
    expect(await auth.resetPassword("20 123 456", CHECK_ID, "motdepasse-ok")).toEqual({
      status: "unavailable",
    });
    expect(await auth.resetPassword("20 123 456", CHECK_ID, "motdepasse-ok")).toEqual({
      status: "maybeChanged",
    });
  });

  it("a 422 for a different proof after an unavailable stays notVerified", async () => {
    const answers: (() => Response)[] = [
      () => json(503, err("INTERNAL_ERROR")),
      () => json(422, refused("phone_check_id", "notVerified")),
    ];
    const { auth } = setup(() => answers.shift()!());
    await auth.resetPassword("20 123 456", CHECK_ID, "motdepasse-ok");
    expect(
      await auth.resetPassword(
        "20 123 456",
        "11111111-1111-4111-8111-111111111111",
        "motdepasse-ok",
      ),
    ).toEqual({ status: "notVerified" });
  });

  it("without a proof it asks for the code again and sends nothing", async () => {
    const { auth, fetchImpl } = setup(() => noBody(204));
    expect(await auth.resetPassword("20 123 456", undefined, "x")).toEqual({
      status: "notVerified",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("api auth adapter: session copy", () => {
  const stored: Session = {
    accountId: "acc-1",
    userId: "acc-1",
    role: null,
    kind: "customer",
    contract: null,
    phoneVerified: true,
    maskedPhone: "+216 20 ••• 456",
  };

  it("refreshSession: 200 updates the copy from Me", async () => {
    const { auth } = setup(() =>
      json(200, me({ kind: "merchant", role: "admin", contract: "pending" })),
    );
    const session = await auth.refreshSession();
    expect(session).toMatchObject({ kind: "merchant", role: "admin", contract: "pending" });
    expect(getSession()).toEqual(session);
  });

  it("refreshSession: 401 clears the copy and returns null", async () => {
    setSession(stored);
    const { auth } = setup(() => json(401, err("AUTH_REQUIRED")));
    expect(await auth.refreshSession()).toBeNull();
    expect(getSession()).toBeNull();
  });

  it("refreshSession: a cut keeps the copy (nothing is known)", async () => {
    setSession(stored);
    const { auth } = setup(() => {
      throw new TypeError("offline");
    });
    expect(await auth.refreshSession()).toEqual(stored);
  });

  it("signOut sends DELETE and clears the copy", async () => {
    setSession(stored);
    const { auth, sent } = setup(() => noBody(204));
    await auth.signOut();
    expect(sent().map((call) => `${call.method} ${call.path}`)).toEqual(["DELETE /v1/sessions"]);
    expect(getSession()).toBeNull();
  });

  it.each([
    [
      "a cut",
      () => {
        throw new TypeError("offline");
      },
    ],
    ["a 500", () => json(500, err("INTERNAL_ERROR"))],
    ["a 401", () => json(401, err("AUTH_REQUIRED"))],
  ])("signOut clears the copy even after %s", async (_label, respond) => {
    setSession(stored);
    const { auth } = setup(respond as () => Response);
    await auth.signOut();
    expect(getSession()).toBeNull();
  });

  it("the copy key is the one the pages read", () => {
    expect(SESSION_KEY).toBe("fg.mock.session");
  });
});
