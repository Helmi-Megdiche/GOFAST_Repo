import { readFileSync } from "node:fs";
import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createApp } from "./app.ts";
import { Operation } from "./http/operation.ts";
import { type Actor, SessionResolver } from "./http/session.ts";
import { bundledSpecPath } from "./http/spec.ts";

const KEY = "2f3c1a52-8d0b-4c1e-9d6f-0a1b2c3d4e5f";
let handlerRuns = 0;
let slow = false;

/** Stand-ins for the handlers of PR 4, bound to real operationIds of the contract. */
@Controller("v1")
class StubController {
  @Post("quotes")
  @Operation("createQuote")
  quote(@Body() body: unknown) {
    return body;
  }
  @Post("orders")
  @Operation("createOrder")
  async order(@Body() body: { quote_id: string }) {
    handlerRuns += 1;
    const n = handlerRuns;
    if (slow) await new Promise((r) => setTimeout(r, 50));
    return { n, quote_id: body.quote_id };
  }
  @Get("me")
  @HttpCode(200)
  @Operation("getMe")
  me() {
    return { ok: true };
  }
}

class FakeSessions extends SessionResolver {
  /** The cookie value is the role, and the account is named after it plus an optional suffix. */
  override async resolve(cookies: Record<string, string | undefined>): Promise<Actor | null> {
    const raw = cookies.session;
    if (!raw) return null;
    const [role = "", account = role] = raw.split(":");
    return { accountId: `acc-${account}`, userId: "u", role: role as Actor["role"] };
  }
}

const spec = parse(readFileSync(bundledSpecPath(), "utf8"));
const ajv = new Ajv2020({ strict: false, validateSchema: false });
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const deref = (node: Json): Json =>
  typeof node.$ref === "string" ? deref(node.$ref.split("/").slice(1).reduce((n: Json, k: string) => n[k], spec)) : node;
/** Checks a body against the contract's schema for that status. It can fail (RV-12). */
const matchesContract = (path: string, method: string, status: number, body: unknown) => {
  const response = deref(spec.paths[path][method].responses[String(status)]);
  return ajv.compile({ ...response.content["application/json"].schema, components: spec.components })(body);
};

const order = {
  quote_id: "11111111-1111-4111-8111-111111111111",
  accepted_total_millimes: 8000,
  sender: {
    name: "Test Sender",
    phone: "+21620000001",
    address: { text: "Rue 1" },
    slot: { start_at: "2026-11-20T08:00:00Z", end_at: "2026-11-20T10:00:00Z" },
  },
  recipient: { name: "Test Recipient", phone: "+21620000002", address: { text: "Rue 2" } },
  parcel: { type: "small", parcels: [{ weight_g: 1500 }], content: "documents" },
  service: { code: "express" },
  payment_mode: "cashPickup",
  terms_accepted: true,
};

let app: NestFastifyApplication;
beforeAll(async () => {
  app = await createApp({ trustProxy: false }, { controllers: [StubController], sessions: new FakeSessions() });
});
afterAll(() => app.close());

const send = (
  method: "GET" | "POST",
  url: string,
  init: { payload?: unknown; headers?: Record<string, string> } = {},
) => app.inject({ method, url, payload: init.payload as object | undefined, headers: init.headers });

const as = (session: string, key: string | null = KEY): Record<string, string> => ({
  cookie: `session=${session}`,
  ...(key ? { "idempotency-key": key } : {}),
});

describe("health and errors", () => {
  it("answers getHealth as the contract says", async () => {
    const r = await send("GET", "/v1/health");
    expect(r.statusCode).toBe(200);
    expect(matchesContract("/v1/health", "get", 200, r.json())).toBe(true);
    expect(matchesContract("/v1/health", "get", 200, { status: "down" })).toBe(false);
  });

  it("answers an unknown route 404 NOT_FOUND in the error shape", async () => {
    const r = await send("GET", "/v1/nope");
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("NOT_FOUND");
    expect(r.json().error.trace_id).toBeTruthy();
    expect(r.json().error.fields).toEqual([]);
  });

  it("follows Accept-Language, falls back to fr, and never changes the code", async () => {
    const get = (lang: string) => send("GET", "/v1/nope", { headers: { "accept-language": lang } });
    const [en, ar, other] = await Promise.all([get("en-GB,fr;q=0.5"), get("ar"), get("de")]);
    expect(en.json().error.message).toBe("Resource not found.");
    expect(ar.json().error.message).not.toBe(en.json().error.message);
    expect(other.json().error.message).toBe("Ressource introuvable.");
    expect([en, ar, other].map((r) => r.json().error.code)).toEqual(["NOT_FOUND", "NOT_FOUND", "NOT_FOUND"]);
  });

  it("refuses broken JSON with 400 VALIDATION_FAILED", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/quotes",
      payload: "{oops",
      headers: { "content-type": "application/json" },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("VALIDATION_FAILED");
  });
});

describe("order of checks: auth 401, roles 403, validation 400, handler", () => {
  it("401 before anything else, even with an invalid body", async () => {
    const r = await send("POST", "/v1/orders", { payload: {}, headers: { "idempotency-key": KEY } });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe("AUTH_REQUIRED");
  });

  it("403 for a role the contract does not list, before validation", async () => {
    const r = await send("POST", "/v1/orders", { payload: {}, headers: as("driver") });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("ACCESS_DENIED");
  });

  it("400 with the failing fields once allowed", async () => {
    const r = await send("POST", "/v1/orders", { payload: { extra: 1 }, headers: as("individual") });
    expect(r.statusCode).toBe(400);
    const names = r.json().error.fields.map((f: { name: string }) => f.name);
    expect(names).toContain("quote_id");
    expect(names).toContain("extra");
  });

  it("400 for a missing or malformed Idempotency-Key", async () => {
    const none = await send("POST", "/v1/orders", { payload: order, headers: as("individual", null) });
    const bad = await send("POST", "/v1/orders", { payload: order, headers: as("individual", "x") });
    for (const r of [none, bad]) {
      expect(r.statusCode).toBe(400);
      expect(r.json().error.fields.map((f: { name: string }) => f.name)).toContain("Idempotency-Key");
    }
  });

  it("each error body matches the contract's schema for its status, and only that one", async () => {
    const r = await send("POST", "/v1/orders", { payload: {}, headers: as("driver") });
    expect(matchesContract("/v1/orders", "post", 403, r.json())).toBe(true);
    expect(matchesContract("/v1/orders", "post", 401, r.json())).toBe(false);
  });

  it("needs no session on a public route", async () => {
    const r = await send("POST", "/v1/quotes", { payload: { service: "nope" } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("accepts a valid order and reaches the handler", async () => {
    handlerRuns = 0;
    const r = await send("POST", "/v1/orders", { payload: order, headers: as("individual:ok", "9a0b1c2d-0000-4000-8000-000000000001") });
    expect(r.statusCode).toBe(201);
    expect(handlerRuns).toBe(1);
  });
});

describe("idempotency (R202)", () => {
  const key = (n: number) => `3b4c5d6e-0000-4000-8000-00000000000${n}`;

  it("replays the first answer and runs the handler once", async () => {
    handlerRuns = 0;
    const first = await send("POST", "/v1/orders", { payload: order, headers: as("individual:a", key(1)) });
    const again = await send("POST", "/v1/orders", { payload: order, headers: as("individual:a", key(1)) });
    expect(again.statusCode).toBe(first.statusCode);
    expect(again.json()).toEqual(first.json());
    expect(handlerRuns).toBe(1);
  });

  it("answers 409 KEY_REUSED for the same key with other content", async () => {
    await send("POST", "/v1/orders", { payload: order, headers: as("individual:b", key(2)) });
    const r = await send("POST", "/v1/orders", {
      payload: { ...order, accepted_total_millimes: 9000 },
      headers: as("individual:b", key(2)),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("KEY_REUSED");
    expect(matchesContract("/v1/orders", "post", 409, r.json())).toBe(true);
  });

  it("does not share a key between two accounts", async () => {
    handlerRuns = 0;
    await send("POST", "/v1/orders", { payload: order, headers: as("individual:c", key(3)) });
    await send("POST", "/v1/orders", { payload: order, headers: as("individual:d", key(3)) });
    expect(handlerRuns).toBe(2);
  });

  it("makes a concurrent second call wait and get the same answer", async () => {
    handlerRuns = 0;
    slow = true;
    try {
      const [a, b] = await Promise.all([
        send("POST", "/v1/orders", { payload: order, headers: as("individual:e", key(4)) }),
        send("POST", "/v1/orders", { payload: order, headers: as("individual:e", key(4)) }),
      ]);
      expect(handlerRuns).toBe(1);
      expect(b.json()).toEqual(a.json());
    } finally {
      slow = false;
    }
  });
});
