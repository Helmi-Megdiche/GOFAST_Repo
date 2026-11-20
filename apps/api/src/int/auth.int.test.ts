import { sql } from "drizzle-orm";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { runSmsOutbox } from "../auth/outbox-worker.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { SmsSender } from "../auth/sms.ts";
import { Passwords } from "../auth/password.ts";
import { Logger } from "@nestjs/common";
import { vi } from "vitest";
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

const build = async (
  db: Db,
  extra: { trustProxy?: number; now?: () => Date; passwords?: Passwords } = {},
) =>
  createApp(
    { trustProxy: extra.trustProxy ?? false },
    authOptions(
      { nodeEnv: "test", allowedOrigins: [ORIGIN] },
      { db, redis, authSecret: "s".repeat(40), totpKey: Buffer.alloc(32, 3), now: extra.now, passwords: extra.passwords },
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

/** The IP every `call` comes from. The per-IP limits are shared, so each new test picks its own. */
let currentIp = "127.0.0.1";

type Res = { statusCode: number; headers: Record<string, unknown>; json: () => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  opts: { body?: unknown; cookie?: string; origin?: boolean; headers?: Record<string, string> } = {},
): Promise<Res> =>
  app.inject({
    method,
    url,
    remoteAddress: currentIp,
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
  for (let i = 0; i < 6; i += 1) await runSmsOutbox(workerDb, sms);
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

    // A verified check for THIS phone, but for the purpose signUp: it must not reset the password.
    const wrongPurpose = await verifiedCheck(PHONE, "signUp");
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

  it("a phone with no active account gets the same answer (204)", async () => {
    currentIp = "10.7.0.1";
    // An unknown phone is sent no code (Q1), so the proof exists only for a phone that had an account:
    // close it between the proof and the reset.
    const phone = "+21620222009";
    const { id } = await newCustomer(phone);
    const check = await verifiedCheck(phone, "reset");
    await q("update core.accounts set status = 'closed', closed_at = now() where id = $1", [id]);
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
    expect(cols.sort()).toEqual(["company_id", "role", "status", "valid_from"]);
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
    const a = await sessions.create(ids.userA, false, await validFromOf(ids.userA));
    const b = await sessions.create(ids.userB, false, await validFromOf(ids.userB));
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

// ---- supervisor round 1 (RV-18, RV-19, T59, T60) -----------------------------------------------

const rawInject = (
  a: NestFastifyApplication,
  ip: string,
  method: "GET" | "POST",
  url: string,
  opts: { body?: unknown; headers?: Record<string, string>; cookie?: string } = {},
) =>
  a.inject({
    method,
    url,
    remoteAddress: ip,
    payload: opts.body as object | undefined,
    headers: { ...(opts.cookie ? { cookie: `session=${opts.cookie}`, origin: ORIGIN } : {}), ...opts.headers },
  }) as unknown as Promise<Res>;

const validFromOf = async (id: string) =>
  (await q("select extract(epoch from sessions_valid_from)::text as v from core.accounts where id = $1", [id])).rows[0].v as string;

async function newCustomer(phone: string): Promise<{ id: string; cookie: string }> {
  const res = await signUp(phone, await verifiedCheck(phone, "signUp"));
  expect(res.statusCode).toBe(201);
  const id = (await q("select id from core.accounts where phone_e164 = $1", [phone])).rows[0].id as string;
  return { id, cookie: sessionOf(res) };
}

describe("a reset kills every older session (Blocking 1)", () => {
  it("even when the Redis index of the account is gone", async () => {
    currentIp = "10.1.0.1";
    const phone = "+21620333001";
    const { id, cookie } = await newCustomer(phone);
    await redis.del(`sess-by:${id}`);
    const done = await call("POST", "/v1/password-resets", {
      body: { phone, phone_check_id: await verifiedCheck(phone, "reset"), new_password: "a brand new secret" },
    });
    expect(done.statusCode).toBe(204);
    expect((await call("GET", "/v1/me", { cookie })).statusCode).toBe(401);
  });

  it("a sign-in that started before a reset commits cannot keep its session", async () => {
    currentIp = "10.1.0.2";
    const phone = "+21620333002";
    await newCustomer(phone);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const inVerify = new Promise<void>((r) => (entered = r));
    class Slow extends Passwords {
      override async verify(stored: string, password: string): Promise<boolean> {
        const ok = await super.verify(stored, password);
        if (ok) {
          entered();
          await gate;
        }
        return ok;
      }
    }
    const slowApp = await build(appDb, { passwords: new Slow() });
    try {
      const signingIn = rawInject(slowApp, currentIp, "POST", "/v1/sessions", {
        body: { identifier: phone, password: PASSWORD },
      });
      await inVerify;
      const reset = await call("POST", "/v1/password-resets", {
        body: { phone, phone_check_id: await verifiedCheck(phone, "reset"), new_password: "a brand new secret" },
      });
      expect(reset.statusCode).toBe(204);
      release();
      const res = await signingIn;
      if (res.statusCode === 201) {
        const me = await rawInject(slowApp, currentIp, "GET", "/v1/me", { cookie: sessionOf(res) });
        expect(me.statusCode).toBe(401);
      } else {
        expect(res.statusCode).toBe(401);
      }
    } finally {
      await slowApp.close();
    }
  });
});

describe("session lifetime: sliding, cap, no resurrection", () => {
  const DAY = 86_400_000;
  it("slides for months while used, then dies at the 90-day cap", async () => {
    const t0 = Date.now();
    let t = t0;
    const store = new SessionStore(redis, () => t);
    const id = await store.create("00000000-0000-4000-8000-0000000000aa", false, "0");
    for (const days of [25, 50, 75]) {
      t = t0 + days * DAY;
      expect(await store.get(id)).not.toBeNull();
    }
    t = t0 + 91 * DAY;
    expect(await store.get(id)).toBeNull();
    expect(await store.get(id)).toBeNull();
  });

  it("a refresh never brings back a session destroyed while it ran (SET XX)", async () => {
    let t = Date.now();
    const racing = new Proxy(redis, {
      get(target, prop, receiver) {
        if (prop === "get") {
          return async (key: string) => {
            const value = await target.get(key);
            await target.del(key); // a logout lands between the read and the refresh
            return value;
          };
        }
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const id = await new SessionStore(redis, () => t).create("00000000-0000-4000-8000-0000000000bb", false, "0");
    t += 2 * 3_600_000;
    expect(await new SessionStore(racing, () => t).get(id)).toBeNull();
    expect(await new SessionStore(redis, () => t).get(id)).toBeNull();
  });
});

describe("proxy hops (Blocking 2)", () => {
  const send = (a: NestFastifyApplication, ip: string, i: number, xff: string) =>
    rawInject(a, ip, "POST", "/v1/phone-checks", {
      body: { phone: `+2162034${String(i).padStart(4, "0")}`, purpose: "signUp" },
      headers: { "x-forwarded-for": xff },
    });

  it("trust proxy 0: X-Forwarded-For is ignored, one counter for the socket address", async () => {
    for (let i = 1; i <= 10; i += 1) expect((await send(app, "10.2.0.1", i, `9.9.${i}.1`)).statusCode).toBe(202);
    expect((await send(app, "10.2.0.1", 11, "9.9.99.1")).statusCode).toBe(429);
  });

  it("trust proxy 1: only the hop the proxy appended counts, a forged first entry does not", async () => {
    const one = await build(appDb, { trustProxy: 1 });
    try {
      for (let i = 1; i <= 10; i += 1) {
        expect((await send(one, "10.2.0.2", 100 + i, `${i}.${i}.${i}.${i}, 2.2.2.2`)).statusCode).toBe(202);
      }
      expect((await send(one, "10.2.0.2", 111, "7.7.7.7, 2.2.2.2")).statusCode).toBe(429);
      expect((await send(one, "10.2.0.2", 112, "7.7.7.7, 3.3.3.3")).statusCode).toBe(202);
    } finally {
      await one.close();
    }
  });
});

describe("the log of an unexpected error (Blocking 3)", () => {
  it("names the failure and leaks no phone, password or hash", async () => {
    currentIp = "10.3.0.1";
    const phone = "+21620335001";
    const check = await verifiedCheck(phone, "signUp");
    const spy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    try {
      // A NUL byte cannot be stored in a text column: Postgres refuses (22021) and the request is a 500.
      const res = await signUp(phone, check, { name: "Client\u0000Test" });
      expect(res.statusCode).toBe(500);
      const logged = spy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
      expect(logged).toContain("22021");
      expect(logged).not.toContain(phone);
      expect(logged).not.toContain(PASSWORD);
      expect(logged).not.toContain("$argon2");
      expect(JSON.stringify(res.json())).not.toContain("22021");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("staff accounts, RV-19 and the audit throttle", () => {
  it("GH-25 T60: a staff account with the right password is refused on /v1/sessions, always (the back-office has its own route)", async () => {
    currentIp = "10.4.0.1";
    const phone = "+21620336001";
    const { id } = await newCustomer(phone);
    await q("update core.accounts set role = 'operations' where id = $1", [id]);
    const res = await call("POST", "/v1/sessions", { body: { identifier: phone, password: PASSWORD } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.fields[0]).toMatchObject({ name: "identifier", reason: "invalidCredentials" });
  });

  it("a customer session on an account that became staff is refused", async () => {
    currentIp = "10.4.0.2";
    const { id, cookie } = await newCustomer("+21620336002");
    expect((await call("GET", "/v1/me", { cookie })).statusCode).toBe(200);
    await q("update core.accounts set role = 'admin' where id = $1", [id]);
    expect((await call("GET", "/v1/me", { cookie })).statusCode).toBe(401);
  });

  it("a closed account is refused on the next request (RV-19)", async () => {
    currentIp = "10.4.0.3";
    const { id, cookie } = await newCustomer("+21620336003");
    await q("update core.accounts set status = 'closed', closed_at = now() where id = $1", [id]);
    expect((await call("GET", "/v1/me", { cookie })).statusCode).toBe(401);
  });

  it("T59: the 429 of a known identifier equals the one of an unknown identifier, trace_id apart", async () => {
    currentIp = "10.4.0.4";
    const phone = "+21620336004";
    await newCustomer(phone);
    const last = async (identifier: string) => {
      let res!: Res;
      for (let i = 0; i < 6; i += 1) {
        res = await call("POST", "/v1/sessions", { body: { identifier, password: "wrong password!" } });
      }
      return res;
    };
    const known = await last(phone);
    const unknown = await last("+21620336999");
    expect(known.statusCode).toBe(429);
    expect(unknown.statusCode).toBe(429);
    const shape = (r: Res) => ({ ...r.json().error, trace_id: undefined });
    expect(shape(known)).toEqual(shape(unknown));
  });

  it("signin.limited is audited once per window, not once per refused call", async () => {
    currentIp = "10.4.0.5";
    const body = { identifier: "+21620336555", password: "wrong password!" };
    const count = async () =>
      Number((await q("select count(*)::int as n from gestion.audit_events where action = 'signin.limited'")).rows[0].n);
    const before = await count();
    for (let i = 0; i < 15; i += 1) await call("POST", "/v1/sessions", { body });
    expect((await count()) - before).toBe(1);
  });

  it("a hash made with old settings is replaced at sign-in", async () => {
    currentIp = "10.4.0.6";
    const phone = "+21620336006";
    const { id } = await newCustomer(phone);
    const { hash } = await import("@node-rs/argon2");
    const weak = await hash(PASSWORD, { algorithm: 2, memoryCost: 8192, timeCost: 1, parallelism: 1 });
    await q("update core.accounts set password_hash = $1 where id = $2", [weak, id]);
    const res = await call("POST", "/v1/sessions", { body: { identifier: phone, password: PASSWORD } });
    expect(res.statusCode).toBe(201);
    const now = (await q("select password_hash from core.accounts where id = $1", [id])).rows[0].password_hash as string;
    expect(now).not.toBe(weak);
    expect(now).toMatch(/m=19456,t=2,p=1/);
  });
});

describe("the outbox payload is scrubbed (RV-21)", () => {
  it("the worker cannot set processed_at and keep the payload", async () => {
    currentIp = "10.5.0.1";
    const sent = await call("POST", "/v1/phone-checks", { body: { phone: "+21620337001", purpose: "signUp" } });
    expect(sent.statusCode).toBe(202);
    const row = (
      await q("select id from core.outbox where topic = 'sms.code' and processed_at is null order by created_at desc limit 1")
    ).rows[0];
    expect(row).toBeDefined();
    await expect(
      workerDb.withWorker((tx) => tx.execute(sql`update core.outbox set processed_at = now() where id = ${row.id}::uuid`)),
    ).rejects.toThrow();
    await runSmsOutbox(workerDb, sms);
    const done = (await q("select payload, processed_at from core.outbox where id = $1", [row.id])).rows[0];
    expect(done.processed_at).not.toBeNull();
    expect(done.payload).toEqual({});
  });
});

// ---- supervisor round 2 (Q1, scrub, validFrom, minors) ------------------------------------------

const drain = async (sender: SmsSender = sms) => {
  for (let i = 0; i < 6; i += 1) await runSmsOutbox(workerDb, sender);
};
const pendingSms = async () =>
  (await q("select payload, attempts, processed_at from core.outbox where topic = 'sms.code' order by created_at")).rows;

describe("Q1: no SMS to an unknown phone (Helmi, comment 6896735959)", () => {
  it("a known and an unknown phone get the same answer and limits; only the known one reaches the sender", async () => {
    currentIp = "10.6.0.1";
    const known = "+21620338001";
    const unknown = "+21620338999";
    await newCustomer(known);
    await drain();
    await q("delete from core.outbox where topic = 'sms.code'");
    sms.sent.length = 0;

    const ask = (phone: string) => call("POST", "/v1/phone-checks", { body: { phone, purpose: "reset" } });
    const [a, b] = [await ask(known), await ask(unknown)];
    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(a.statusCode);
    expect(Object.keys(b.json()).sort()).toEqual(Object.keys(a.json()).sort());

    // the same limit, counted the same way: the immediate second ask is refused for both, alike
    const [a2, b2] = [await ask(known), await ask(unknown)];
    expect(a2.statusCode).toBe(429);
    expect(b2.statusCode).toBe(429);
    const shape = (r: Res) => ({ ...r.json().error, trace_id: undefined });
    expect(shape(b2)).toEqual(shape(a2));

    // the same work: one outbox row each, the unknown one flagged and without phone or code
    const rows = await pendingSms();
    expect(rows).toHaveLength(2);
    const skipped = rows.filter((r) => (r.payload as { skip?: boolean }).skip === true);
    expect(skipped).toHaveLength(1);
    expect(JSON.stringify(skipped[0].payload)).not.toContain("+216");
    expect(Object.keys(skipped[0].payload as object)).not.toContain("code");

    await drain();
    expect(sms.sent.map((s) => s.phone)).toEqual([known]);
    const after = await pendingSms();
    expect(after.every((r) => r.processed_at !== null && JSON.stringify(r.payload) === "{}")).toBe(true);
  });

  it("a sign-up code still goes to a phone with no account", async () => {
    currentIp = "10.6.0.2";
    const phone = "+21620338002";
    sms.sent.length = 0;
    await call("POST", "/v1/phone-checks", { body: { phone, purpose: "signUp" } });
    await drain();
    expect(sms.sent.map((s) => s.phone)).toEqual([phone]);
  });
});

describe("the scrub after the last failed send (RV-21)", () => {
  class Failing extends SmsSender {
    override async send(): Promise<void> {
      throw new Error("provider down");
    }
  }
  it("keeps the payload for 2 failed tries and empties it at the 3rd", async () => {
    currentIp = "10.6.0.3";
    await drain();
    await q("delete from core.outbox where topic = 'sms.code'");
    await call("POST", "/v1/phone-checks", { body: { phone: "+21620338003", purpose: "signUp" } });
    const one = async () => (await pendingSms())[0];
    await runSmsOutbox(workerDb, new Failing());
    await runSmsOutbox(workerDb, new Failing());
    let row = await one();
    expect(row.attempts).toBe(2);
    expect(row.processed_at).toBeNull();
    expect((row.payload as { phone?: string }).phone).toBe("+21620338003");
    await runSmsOutbox(workerDb, new Failing());
    row = await one();
    expect(row.attempts).toBe(3);
    expect(row.processed_at).not.toBeNull();
    expect(row.payload).toEqual({});
  });
});

describe("the session keeps the cut-off read with the hash (no clock)", () => {
  it("a session with another value than the account's is refused", async () => {
    currentIp = "10.6.0.4";
    const { id } = await newCustomer("+21620338004");
    const stale = await sessions.create(id, false, "1");
    expect((await call("GET", "/v1/me", { cookie: stale })).statusCode).toBe(401);
    const fresh = await sessions.create(id, false, await validFromOf(id));
    expect((await call("GET", "/v1/me", { cookie: fresh })).statusCode).toBe(200);
  });

  it("a reset always changes the value, even dated before it (same millisecond, skewed clock)", async () => {
    currentIp = "10.6.0.5";
    const phone = "+21620338005";
    const { id } = await newCustomer(phone);
    await q("update core.accounts set sessions_valid_from = '2030-01-01T00:00:00Z' where id = $1", [id]);
    const before = await validFromOf(id);
    await q("select core.set_password($1, $2, '2020-01-01T00:00:00Z')", [phone, "$argon2id$placeholder"]);
    expect(await validFromOf(id)).not.toBe(before);
  });
});

describe("minor: sign-in and sign-up", () => {
  it("the old cookie's session is dead after a new sign-in", async () => {
    currentIp = "10.6.0.6";
    const phone = "+21620338006";
    const { cookie: old } = await newCustomer(phone);
    const res = await call("POST", "/v1/sessions", { body: { identifier: phone, password: PASSWORD }, cookie: old });
    expect(res.statusCode).toBe(201);
    expect((await call("GET", "/v1/me", { cookie: old })).statusCode).toBe(401);
    expect((await call("GET", "/v1/me", { cookie: sessionOf(res) })).statusCode).toBe(200);
  });

  it("a too-short password leaves the phone check usable", async () => {
    currentIp = "10.6.0.7";
    const phone = "+21620338007";
    const check = await verifiedCheck(phone, "signUp");
    const short = await signUp(phone, check, { password: "short" });
    expect(short.statusCode).toBeGreaterThanOrEqual(400);
    expect(short.statusCode).toBeLessThan(500);
    expect(JSON.stringify(short.json())).toContain("passwordTooShort");
    expect((await signUp(phone, check)).statusCode).toBe(201);
  });
});

describe("GH-9 R102: a wrong code puts attempts_left in fields[].details", () => {
  it("answers 422 RULE_REFUSED with details on the code field and no top-level details, then counts down", async () => {
    currentIp = "10.8.0.1";
    const phone = "+21620444001";
    const sent = await call("POST", "/v1/phone-checks", { body: { phone, purpose: "signUp" } });
    expect(sent.statusCode).toBe(202);
    for (let i = 0; i < 6; i += 1) await runSmsOutbox(workerDb, sms);
    const real = sms.codeFor(phone);
    const wrong = real === "000000" ? "111111" : "000000";
    const verify = () => call("POST", "/v1/phone-checks/verify", { body: { phone, purpose: "signUp", code: wrong } });

    const first = await verify();
    expect(first.statusCode).toBe(422);
    const body = first.json();
    expect(body.error.code).toBe("RULE_REFUSED");
    expect(body.error.fields).toEqual([{ name: "code", reason: "wrong", details: { attempts_left: 4 } }]);
    expect("details" in body.error).toBe(false); // the contract has no top-level details (ErrorInfo)

    const second = await verify();
    expect(second.json().error.fields[0].details).toEqual({ attempts_left: 3 });
    expect("details" in second.json().error).toBe(false);
  });
});

describe("GH-9 R102: reset checks the password length before it spends the proof", () => {
  it("a 9-character password is refused with passwordTooShort, and the same proof still resets with a valid one, once", async () => {
    currentIp = "10.8.0.2";
    const phone = "+21620444002";
    await newCustomer(phone);
    const check = await verifiedCheck(phone, "reset");
    const reset = (new_password: string) =>
      call("POST", "/v1/password-resets", { body: { phone, phone_check_id: check, new_password } });

    const short = await reset("123456789");
    expect(short.statusCode).toBe(422);
    expect(short.json().error.fields).toEqual([{ name: "new_password", reason: "passwordTooShort" }]);

    const done = await reset("a brand new secret");
    expect(done.statusCode).toBe(204);
    const signedIn = await call("POST", "/v1/sessions", { body: { identifier: phone, password: "a brand new secret" } });
    expect(signedIn.statusCode).toBe(201);

    const again = await reset("another new secret");
    expect(again.statusCode).toBe(422);
    expect(again.json().error.fields).toEqual([{ name: "phone_check_id", reason: "invalid" }]); // still single use
  });
});
