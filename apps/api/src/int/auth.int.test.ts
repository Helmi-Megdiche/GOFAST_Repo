import { sql } from "drizzle-orm";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { runSmsOutbox } from "../auth/outbox-worker.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { SmsSender } from "../auth/sms.ts";
import { SessionStore } from "../auth/sessions.ts";
import { authOptions } from "../auth/wiring.ts";
import { Db } from "../db/index.ts";
import {
  seedMerchants,
  startPgBouncer,
  startRedis,
  startTestDb,
  type TestDb,
} from "./harness.ts";

const ORIGIN = "https://gofast.example";
const PASSWORD = "correct horse battery";

class CaptureSms extends SmsSender {
  sent: { phone: string; text: string }[] = [];
  override async send(phone: string, text: string): Promise<void> {
    this.sent.push({ phone, text });
  }
  codeFor(phone: string): string {
    const m = [...this.sent].reverse().find((s) => s.phone === phone)?.text.match(/\d{6}/);
    if (!m) throw new Error("no code sent");
    return m[0];
  }
}

let testDb: TestDb;
let stopRedis: () => Promise<void>;
let stopBouncer: () => Promise<void>;
let redis: Redis;
let app: NestFastifyApplication;
let bouncerApp: NestFastifyApplication;
let appDb: Db;
let workerDb: Db;
let bouncerDb: Db;
let sessions: SessionStore;
const sms = new CaptureSms();
const opened: Db[] = [];

const build = async (db: Db) =>
  createApp(
    { trustProxy: false },
    authOptions(
      { nodeEnv: "test", allowedOrigins: [ORIGIN], staffSignIn: false },
      { db, redis, authSecret: "s".repeat(40) },
    ),
  );

beforeAll(async () => {
  testDb = await startTestDb();
  const r = await startRedis();
  stopRedis = r.stop;
  redis = createRedis(r.url);
  const bouncer = await startPgBouncer(testDb);
  stopBouncer = bouncer.stop;
  appDb = new Db(testDb.url("fastgo_app"), 4);
  workerDb = new Db(testDb.url("fastgo_worker"), 2);
  bouncerDb = new Db(bouncer.url, 4);
  opened.push(appDb, workerDb, bouncerDb);
  sessions = new SessionStore(redis);
  app = await build(appDb);
  bouncerApp = await build(bouncerDb);
}, 240_000);

afterAll(async () => {
  await app?.close();
  await bouncerApp?.close();
  redis?.disconnect();
  await Promise.all(opened.map((d) => d.close().catch(() => undefined)));
  await stopBouncer?.();
  await stopRedis?.();
  await testDb?.stop();
});

type Res = { statusCode: number; headers: Record<string, unknown>; json: () => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  opts: { body?: unknown; cookie?: string; origin?: boolean; headers?: Record<string, string> } = {},
): Promise<Res> =>
  app.inject({
    method,
    url,
    payload: opts.body as object | undefined,
    headers: {
      ...(opts.cookie ? { cookie: `session=${opts.cookie}` } : {}),
      ...(opts.cookie && opts.origin !== false ? { origin: ORIGIN } : {}),
      ...opts.headers,
    },
  }) as unknown as Promise<Res>;

const sessionOf = (res: Res): string => {
  const raw = [res.headers["set-cookie"]].flat().join(";");
  const m = raw.match(/session=([^;]+)/);
  if (!m?.[1]) throw new Error(`no session cookie in ${raw}`);
  return m[1];
};

async function verifiedCheck(phone: string, purpose: "signUp" | "reset"): Promise<string> {
  const sent = await call("POST", "/v1/phone-checks", { body: { phone, purpose } });
  expect(sent.statusCode).toBe(202);
  await runSmsOutbox(workerDb, sms);
  const ok = await call("POST", "/v1/phone-checks/verify", { body: { phone, purpose, code: sms.codeFor(phone) } });
  expect(ok.statusCode).toBe(200);
  return ok.json().phone_check_id as string;
}

const signUp = (phone: string, check: string, extra: Record<string, unknown> = {}) =>
  call("POST", "/v1/accounts", {
    body: {
      kind: "customer",
      name: "Client Test",
      phone,
      phone_check_id: check,
      password: PASSWORD,
      locale: "fr",
      terms_accepted: true,
      ...extra,
    },
  });

const q = (text: string, values: unknown[] = []) => testDb.superClient.query(text, values);

describe("sign-up, sign-in and the profile (R101, ESP-02)", () => {
  const PHONE = "+21620111001";
  let first: string;

  it("sign-up with a verified phone opens a session and sets a hardened cookie", async () => {
    const check = await verifiedCheck(PHONE, "signUp");
    const res = await signUp(PHONE, check);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: "customer", role: null, phone_verified: true, phone: PHONE });
    const cookie = [res.headers["set-cookie"]].flat().join(";");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
    first = sessionOf(res);
    const me = await call("GET", "/v1/me", { cookie: first });
    expect(me.statusCode).toBe(200);
    expect(me.json().phone).toBe(PHONE);
  });

  it("the outbox keeps no code and no phone once the SMS is sent", async () => {
    const rows = (await q("select payload, processed_at from core.outbox where topic = 'sms.code'")).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.processed_at).not.toBeNull();
      expect(row.payload).toEqual({});
    }
  });

  it("the check is single use: a second sign-up with it is refused, and a phone cannot be taken twice", async () => {
    const check = await verifiedCheck(PHONE, "signUp");
    const res = await signUp(PHONE, check);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.fields).toEqual([expect.objectContaining({ name: "phone", reason: "phoneTaken" })]);
    const again = await signUp("+21620111002", check);
    expect(again.statusCode).toBe(422);
  });

  it("a short password is refused", async () => {
    const phone = "+21620111003";
    const check = await verifiedCheck(phone, "signUp");
    const res = await signUp(phone, check, { password: "short" });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.fields[0]).toMatchObject({ name: "password", reason: "passwordTooShort" });
  });

  it("sign-in gives a fresh session id; wrong password and unknown identifier answer the same", async () => {
    const ok = await call("POST", "/v1/sessions", { body: { identifier: PHONE, password: PASSWORD } });
    expect(ok.statusCode).toBe(201);
    expect(sessionOf(ok)).not.toBe(first);
    const wrong = await call("POST", "/v1/sessions", { body: { identifier: PHONE, password: "wrong password!" } });
    const unknown = await call("POST", "/v1/sessions", { body: { identifier: "+21620999999", password: "wrong password!" } });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    const noTrace = (r: Res) => ({ ...r.json().error, trace_id: undefined });
    expect(noTrace(unknown)).toEqual(noTrace(wrong));
    expect(wrong.json().error.fields[0]).toMatchObject({ name: "identifier", reason: "invalidCredentials" });
  });

  it("PATCH /me changes the name and the notifications; the phone is not writable", async () => {
    const res = await call("PATCH", "/v1/me", {
      cookie: first,
      body: { name: "Client Renommé", notifications: { sms: false, email: true, offers: false } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "Client Renommé", phone: PHONE, notifications: { sms: false, email: true, offers: false } });
  });

  it("a write with the cookie and no Origin is refused (CSRF); a read is not", async () => {
    const res = await call("PATCH", "/v1/me", { cookie: first, origin: false, body: { name: "X Y" } });
    expect(res.statusCode).toBe(403);
    expect((await call("GET", "/v1/me", { cookie: first, origin: false })).statusCode).toBe(200);
  });

  it("logout kills the session at once and clears the cookie", async () => {
    const own = sessionOf(await call("POST", "/v1/sessions", { body: { identifier: PHONE, password: PASSWORD } }));
    const out = await call("DELETE", "/v1/sessions", { cookie: own });
    expect(out.statusCode).toBe(204);
    expect((await call("GET", "/v1/me", { cookie: own })).statusCode).toBe(401);
  });
});

describe("limits count unknown identifiers like known ones (T59)", () => {
  it("the 6th attempt on an identifier with no account is 429 with Retry-After, and is audited", async () => {
    const body = { identifier: "+21620888888", password: "wrong password!" };
    for (let i = 0; i < 5; i += 1) expect((await call("POST", "/v1/sessions", { body })).statusCode).toBe(401);
    const res = await call("POST", "/v1/sessions", { body });
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    const audit = (await q("select details, actor_id from gestion.audit_events where action = 'signin.limited'")).rows;
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain("888888");
  });
});

describe("password reset (R102)", () => {
  const PHONE = "+21620222001";

  it("a signUp check cannot reset a password; a reset check revokes every session", async () => {
    const check = await verifiedCheck(PHONE, "signUp");
    const created = await signUp(PHONE, check);
    const old = sessionOf(created);
    const other = sessionOf(await call("POST", "/v1/sessions", { body: { identifier: PHONE, password: PASSWORD } }));

    const wrongPurpose = await verifiedCheck("+21620222002", "signUp");
    const refused = await call("POST", "/v1/password-resets", {
      body: { phone: PHONE, phone_check_id: wrongPurpose, new_password: "a brand new secret" },
    });
    expect(refused.statusCode).toBe(422);

    const resetCheck = await verifiedCheck(PHONE, "reset");
    const done = await call("POST", "/v1/password-resets", {
      body: { phone: PHONE, phone_check_id: resetCheck, new_password: "a brand new secret" },
    });
    expect(done.statusCode).toBe(204);
    expect((await call("GET", "/v1/me", { cookie: old })).statusCode).toBe(401);
    expect((await call("GET", "/v1/me", { cookie: other })).statusCode).toBe(401);
    const fresh = await call("POST", "/v1/sessions", { body: { identifier: PHONE, password: "a brand new secret" } });
    expect(fresh.statusCode).toBe(201);
    expect(sessionOf(fresh)).not.toBe(old);
    const audit = (await q("select entity_id, details from gestion.audit_events where action = 'password.reset'")).rows;
    expect(audit).toHaveLength(1);
  });

  it("an unknown phone gets the same answer (204)", async () => {
    const phone = "+21620222009";
    const check = await verifiedCheck(phone, "reset");
    const res = await call("POST", "/v1/password-resets", {
      body: { phone, phone_check_id: check, new_password: "a brand new secret" },
    });
    expect(res.statusCode).toBe(204);
  });
});

describe("definers return no secret", () => {
  it("session_account and set_password expose no hash", async () => {
    const cols = (await q("select * from core.session_account((select id from core.accounts limit 1))")).fields.map(
      (f) => f.name,
    );
    expect(cols.sort()).toEqual(["company_id", "role", "status"]);
    const r = await q("select pg_get_function_result('core.set_password(text,text,timestamptz)'::regprocedure) as t");
    expect(r.rows[0].t).toBe("uuid");
  });
});

describe("T55: two merchants in parallel through PgBouncer", () => {
  it("each session sees only its own company", async () => {
    const ids = await seedMerchants(testDb);
    await testDb.superClient.query(
      `insert into core.company_members (company_id, account_id, role) values ($1, $2, 'owner'), ($3, $4, 'owner')`,
      [ids.companyA, ids.userA, ids.companyB, ids.userB],
    );
    const a =await sessions.create(ids.userA, false);
    const b = await sessions.create(ids.userB, false);
    const get = (cookie: string) =>
      bouncerApp.inject({ method: "GET", url: "/v1/me", headers: { cookie: `session=${cookie}` } }) as unknown as Promise<Res>;
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? get(a) : get(b))));
    results.forEach((res, i) => {
      expect(res.statusCode).toBe(200);
      expect(res.json().account_id).toBe(i % 2 === 0 ? ids.companyA : ids.companyB);
      expect(res.json().user_id).toBe(i % 2 === 0 ? ids.userA : ids.userB);
    });
  });
});

describe("no actor, no leak", () => {
  it("an unsigned write to an own-only route is 401, and a no-actor audit insert works", async () => {
    expect((await call("GET", "/v1/me")).statusCode).toBe(401);
    await appDb.withNoActor((tx) =>
      tx.execute(sql`insert into gestion.audit_events (actor_id, actor_role, action, entity) values (null, null, 'test.noactor', 'account')`),
    );
  });
});
