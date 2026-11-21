import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryStorage } from "../storage";
import { setSession, type Session } from "../data/session";
import { AuthRequiredError, NetworkError, ServerError } from "./errors";
import { createApiClient } from "./client";
import { createApiProfile } from "./profile";

/**
 * GH-20 (20-d): the profile on the real API (GET and PATCH /v1/me). Fake fetch, no network. Every
 * status code the contract lists for the two routes has a case. R902 / RV-17: the language is
 * saved with a body that is exactly {locale}. Values are distinct on purpose so a swapped field fails.
 */

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const err = (code: string, fields: { name: string; reason: string }[] = []) => ({
  error: { code, message: "x", fields, trace_id: "tr-7" },
});

const SESSION = { accountId: "acc-1", userId: "usr-1" } as unknown as Session;

function me(over: Record<string, unknown> = {}) {
  return {
    account_id: "0b6f7f0e-1111-4222-8333-444455556666",
    user_id: "0b6f7f0e-1111-4222-8333-444455557777",
    kind: "customer",
    role: null,
    contract: null,
    phone_verified: true,
    name: "Amel Test",
    phone: "+21698000001",
    email: "amel@example.test",
    google: false,
    locale: "ar",
    notifications: { sms: true, email: false, offers: true },
    ...over,
  };
}

type Call = { method: string; path: string; body: string };

function setup(respond: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (request: Request) => {
    const call: Call = {
      method: request.method,
      path: new URL(request.url).pathname,
      body: await request.text(),
    };
    calls.push(call);
    return respond(call);
  });
  const profile = createApiProfile(
    createApiClient({ fetch: fetchImpl, baseUrl: "http://web.test" }),
  );
  return { calls, profile };
}

beforeEach(() => useMemoryStorage());

describe("api profile adapter, read (GET /v1/me)", () => {
  it("200 maps every field of the person, nothing defaulted", async () => {
    const { profile, calls } = setup(() => json(200, me()));
    expect(await profile.get(SESSION)).toEqual({
      name: "Amel Test",
      phone: "+21698000001",
      email: "amel@example.test",
      google: false,
      locale: "ar",
      notifications: { sms: true, email: false, offers: true },
      phoneVerified: true,
    });
    expect(calls).toEqual([{ method: "GET", path: "/v1/me", body: "" }]);
  });

  it("200 keeps null name, phone and e-mail as null and an unverified phone as false (RV-28)", async () => {
    const { profile } = setup(() =>
      json(200, me({ name: null, phone: null, email: null, phone_verified: false })),
    );
    const result = await profile.get(SESSION);
    expect(result.name).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
    expect(result.phoneVerified).toBe(false);
  });

  it("401 throws AuthRequiredError (the screen goes to sign-in)", async () => {
    const { profile } = setup(() => json(401, err("AUTH_REQUIRED")));
    await expect(profile.get(SESSION)).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("500 throws ServerError with the trace id and no server text", async () => {
    const { profile } = setup(() => json(500, err("INTERNAL_ERROR")));
    const failure = await profile.get(SESSION).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ServerError);
    expect((failure as ServerError).traceId).toBe("tr-7");
    expect((failure as Error).message).not.toContain("x");
  });

  it("any other status (404, 502) throws ServerError", async () => {
    for (const status of [404, 502]) {
      const { profile } = setup(() => json(status, err("OTHER")));
      await expect(profile.get(SESSION)).rejects.toBeInstanceOf(ServerError);
    }
  });

  it("a lost answer throws NetworkError", async () => {
    const { profile } = setup(() => {
      throw new TypeError("cut");
    });
    await expect(profile.get(SESSION)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("api profile adapter, write (PATCH /v1/me)", () => {
  it("name: sends only {name}, trimmed, and 200 is ok", async () => {
    const { profile, calls } = setup(() => json(200, me({ name: "Lina Test" })));
    expect(await profile.updateName(SESSION, "  Lina Test ")).toEqual({ status: "ok" });
    expect(calls).toEqual([{ method: "PATCH", path: "/v1/me", body: '{"name":"Lina Test"}' }]);
  });

  it("name: a blank name is invalidName without a request", async () => {
    const { profile, calls } = setup(() => json(200, me()));
    expect(await profile.updateName(SESSION, "   ")).toEqual({ status: "invalidName" });
    expect(calls).toEqual([]);
  });

  it("name: 400 on the name field is invalidName", async () => {
    const { profile } = setup(() =>
      json(400, err("VALIDATION_FAILED", [{ name: "name", reason: "minLength" }])),
    );
    expect(await profile.updateName(SESSION, "A")).toEqual({ status: "invalidName" });
  });

  it("name: 400 on another field is a ServerError (the form cannot send one)", async () => {
    const { profile } = setup(() =>
      json(400, err("VALIDATION_FAILED", [{ name: "locale", reason: "enum" }])),
    );
    await expect(profile.updateName(SESSION, "Lina")).rejects.toBeInstanceOf(ServerError);
  });

  it("name: 401 throws AuthRequiredError", async () => {
    const { profile } = setup(() => json(401, err("AUTH_REQUIRED")));
    await expect(profile.updateName(SESSION, "Lina")).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("name: 403 is forbidden (a staff role, nothing to retry)", async () => {
    const { profile } = setup(() => json(403, err("ACCESS_DENIED")));
    expect(await profile.updateName(SESSION, "Lina")).toEqual({ status: "forbidden" });
  });

  it("name: 500 throws ServerError with the trace id", async () => {
    const { profile } = setup(() => json(500, err("INTERNAL_ERROR")));
    const failure = await profile.updateName(SESSION, "Lina").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ServerError);
    expect((failure as ServerError).traceId).toBe("tr-7");
  });

  it("name: a lost answer throws NetworkError", async () => {
    const { profile } = setup(() => {
      throw new TypeError("cut");
    });
    await expect(profile.updateName(SESSION, "Lina")).rejects.toBeInstanceOf(NetworkError);
  });

  it("notifications: sends the three booleans together and nothing else", async () => {
    const { profile, calls } = setup(() => json(200, me()));
    const wanted = { sms: false, email: true, offers: false };
    expect(await profile.setNotifications(SESSION, wanted)).toEqual({ status: "ok" });
    expect(JSON.parse(calls[0]!.body)).toEqual({ notifications: wanted });
  });

  it("notifications: 401, 403, 500 and a lost answer map like the name", async () => {
    const wanted = { sms: true, email: true, offers: true };
    const a = setup(() => json(401, err("AUTH_REQUIRED")));
    await expect(a.profile.setNotifications(SESSION, wanted)).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
    const b = setup(() => json(403, err("ACCESS_DENIED")));
    expect(await b.profile.setNotifications(SESSION, wanted)).toEqual({ status: "forbidden" });
    const c = setup(() => json(500, err("INTERNAL_ERROR")));
    await expect(c.profile.setNotifications(SESSION, wanted)).rejects.toBeInstanceOf(ServerError);
    const d = setup(() => {
      throw new TypeError("cut");
    });
    await expect(d.profile.setNotifications(SESSION, wanted)).rejects.toBeInstanceOf(NetworkError);
  });

  it("notifications: a 400 is a ServerError (the toggles cannot send an invalid body)", async () => {
    const { profile } = setup(() =>
      json(400, err("VALIDATION_FAILED", [{ name: "notifications", reason: "x" }])),
    );
    await expect(
      profile.setNotifications(SESSION, { sms: true, email: true, offers: true }),
    ).rejects.toBeInstanceOf(ServerError);
  });

  it("R902 / RV-17: the language is saved with a body that is exactly {locale}", async () => {
    const { profile, calls } = setup(() => json(200, me({ locale: "en" })));
    expect(await profile.setLocale(SESSION, "en")).toEqual({ status: "ok" });
    expect(calls).toEqual([{ method: "PATCH", path: "/v1/me", body: '{"locale":"en"}' }]);
  });

  it("language: 401, 403, 500 and a lost answer map like the name", async () => {
    const a = setup(() => json(401, err("AUTH_REQUIRED")));
    await expect(a.profile.setLocale(SESSION, "fr")).rejects.toBeInstanceOf(AuthRequiredError);
    const b = setup(() => json(403, err("ACCESS_DENIED")));
    expect(await b.profile.setLocale(SESSION, "fr")).toEqual({ status: "forbidden" });
    const c = setup(() => json(500, err("INTERNAL_ERROR")));
    await expect(c.profile.setLocale(SESSION, "fr")).rejects.toBeInstanceOf(ServerError);
    const d = setup(() => {
      throw new TypeError("cut");
    });
    await expect(d.profile.setLocale(SESSION, "fr")).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("api profile adapter, header switcher (R902 / RV-17)", () => {
  it("signed out (no session copy): no request at all", async () => {
    const { profile, calls } = setup(() => json(200, me()));
    await profile.saveLocaleIfSignedIn("en");
    expect(calls).toEqual([]);
  });

  it("a failure is silent, as on the mock", async () => {
    const { profile, calls } = setup(() => json(500, err("INTERNAL_ERROR")));
    setSession({
      ...SESSION,
      role: null,
      kind: "customer",
      contract: null,
      phoneVerified: true,
      maskedPhone: "",
    });
    await expect(profile.saveLocaleIfSignedIn("en")).resolves.toBeUndefined();
    expect(calls).toEqual([
      { method: "PATCH", path: "/v1/me", body: JSON.stringify({ locale: "en" }) },
    ]);
  });

  it("capabilities: nothing the API has no route for is offered", () => {
    const { profile } = setup(() => json(200, me()));
    expect(profile.kind).toBe("api");
    expect(profile.emailAvailable).toBe(false);
    expect(profile.googleAvailable).toBe(false);
    expect(profile.closeAvailable).toBe(false);
  });
});
