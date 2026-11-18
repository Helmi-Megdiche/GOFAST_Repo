import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { Passwords } from "../auth/password.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { authOptions } from "../auth/wiring.ts";
import { base32Encode, encryptSecret, newSecret, totpCode, totpStep } from "../auth/totp.ts";
import { Db } from "../db/index.ts";
import { startRedis, startTestDb, type TestDb } from "./harness.ts";

// GH-25 T60 RV-19 RV-20 R102: the back-office sign-in with a second factor, over HTTP, against a real database and Redis.

const ORIGIN = "https://backoffice.gofast.example";
const PASSWORD = "correct horse battery";
const KEY = Buffer.alloc(32, 9);

let testDb: TestDb;
let stopRedis: () => Promise<void>;
let redis: Redis;
let db: Db;
let operator: pg.Client;
let app: NestFastifyApplication;
const now = Date.parse("2026-11-20T10:00:10.000Z"); // 10 s into a 30-second step
const q = (text: string, values: unknown[] = []) => testDb.superClient.query(text, values);

beforeAll(async () => {
  testDb = await startTestDb();
  const r = await startRedis();
  stopRedis = r.stop;
  redis = createRedis(r.url);
  db = new Db(testDb.url("fastgo_app"), 4);
  operator = new pg.Client({ connectionString: testDb.url("fastgo_migrator") });
  await operator.connect();
  app = await createApp(
    { trustProxy: false },
    authOptions({ nodeEnv: "test", allowedOrigins: [ORIGIN] }, { db, redis, authSecret: "s".repeat(40), totpKey: KEY, now: () => new Date(now) }),
  );
}, 240_000);
afterAll(async () => {
  await app?.close();
  await db?.close();
  await operator?.end().catch(() => undefined);
  redis?.disconnect();
  await stopRedis?.();
  await testDb?.stop();
});

let ip = "10.30.0.1";
type Res = { statusCode: number; headers: Record<string, unknown>; json: () => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = (method: "GET" | "POST", url: string, opts: { body?: unknown; cookie?: string } = {}): Promise<Res> =>
  app.inject({
    method,
    url,
    remoteAddress: ip,
    payload: opts.body as object | undefined,
    headers: opts.cookie ? { cookie: `session=${opts.cookie}`, origin: ORIGIN } : {},
  }) as unknown as Promise<Res>;

let seq = 0;
const passwords = new Passwords();
type Who = { id: string; email: string; secret: Buffer };
/** An account with a password, and (for staff) an enrolled second factor made the way the operator does it. */
async function make(role: string, over: { enrol?: boolean; status?: string } = {}): Promise<Who> {
  seq += 1;
  const id = randomUUID();
  const email = `person${seq}@fastgo.example`;
  const kind = role === "individual" ? "customer" : role === "merchant" ? "merchant" : "staff";
  const closed = over.status === "closed";
  await q(
    `insert into core.accounts (id, kind, role, full_name, email, password_hash, phone_verified_at, status, closed_at)
     values ($1, $2, $3, 'Test', $4, $5, now(), $6, ${closed ? "now()" : "null"})`,
    [id, kind, role, email, await passwords.hash(PASSWORD), over.status ?? "active"],
  );
  const secret = newSecret();
  const enrol = over.enrol ?? kind === "staff";
  if (enrol) {
    if (kind === "staff" && role !== "driver" && !closed) await operator.query("select core.staff_totp_enrol($1::uuid, $2::bytea)", [id, encryptSecret(secret, KEY, id)]);
    else await q("insert into core.staff_totp (account_id, secret_enc) values ($1, $2)", [id, encryptSecret(secret, KEY, id)]);
  }
  return { id, email, secret };
}
const codeAt = (who: Who, offsetSteps = 0) => totpCode(who.secret, totpStep(now) + offsetSteps);
const staffSignIn = (who: Who, code: string, password = PASSWORD, identifier = who.email) =>
  call("POST", "/v1/staff/sessions", { body: { identifier, password, code } });
/** The answer of a refusal without its trace id: the same for every cause. */
const refusal = (res: Res) => {
  const error = Object.fromEntries(Object.entries(res.json().error as Record<string, unknown>).filter(([k]) => k !== "trace_id"));
  return { status: res.statusCode, error };
};
const SAME_401 = { status: 401, error: expect.objectContaining({ code: "AUTH_REQUIRED", fields: [{ name: "identifier", reason: "invalidCredentials" }] }) };

describe("GH-25 T60: the right code signs a staff member in", () => {
  it("201 with the person, a 12-hour session cookie, and the session works on GET /v1/me", async () => {
    ip = "10.30.1.1";
    const who = await make("admin");
    const res = await staffSignIn(who, codeAt(who));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: "staff", role: "admin", email: who.email });
    const cookie = [res.headers["set-cookie"]].flat().join(";");
    expect(cookie).toMatch(/session=[^;]+/);
    expect(cookie).toMatch(/Max-Age=43200/i); // 12 h, fixed (the staff session of 0006)
    const sid = cookie.match(/session=([^;]+)/)?.[1] as string;
    expect((await call("GET", "/v1/me", { cookie: sid })).json()).toMatchObject({ role: "admin" });
  });

  it("each back-office role signs in; a malformed code is a 400 before anything is checked", async () => {
    ip = "10.30.1.2";
    for (const role of ["agent", "operations", "logistics", "customer_service", "accountant", "management", "cashier"]) {
      const who = await make(role);
      const res = await staffSignIn(who, codeAt(who));
      expect([role, res.statusCode]).toEqual([role, 201]);
      expect(res.json().role).toBe(role);
    }
    const who = await make("agent");
    for (const bad of ["12345", "1234567", "12345a", ""]) expect((await staffSignIn(who, bad)).statusCode, bad).toBe(400);
  });
});

describe("GH-25 T60: the window of one step, and a code is usable once", () => {
  it("accepts the previous step and the next step; refuses two steps away in both directions", async () => {
    ip = "10.30.2.1";
    const who = await make("agent");
    expect((await staffSignIn(who, codeAt(who, -2))).statusCode).toBe(401);
    expect((await staffSignIn(who, codeAt(who, 2))).statusCode).toBe(401);
    expect((await staffSignIn(who, codeAt(who, -1))).statusCode).toBe(201);
    expect((await staffSignIn(who, codeAt(who, 1))).statusCode).toBe(201);
  });

  it("refuses a code that was already used, even inside the window, and then the next step works", async () => {
    ip = "10.30.2.2";
    const who = await make("agent");
    const code = codeAt(who);
    expect((await staffSignIn(who, code)).statusCode).toBe(201);
    expect(refusal(await staffSignIn(who, code))).toMatchObject(SAME_401);
    // an older step than the last one used is refused as well (no going back)
    expect((await staffSignIn(who, codeAt(who, -1))).statusCode).toBe(401);
    expect((await staffSignIn(who, codeAt(who, 1))).statusCode).toBe(201);
  });

  it("a wrong password does not burn the step: the same code works afterwards", async () => {
    ip = "10.30.2.3";
    const who = await make("agent");
    expect((await staffSignIn(who, codeAt(who), "not the password")).statusCode).toBe(401);
    expect((await staffSignIn(who, codeAt(who))).statusCode).toBe(201);
  });
});

describe("GH-25 T60 RV-19 RV-20: every refusal is the same 401", () => {
  it("wrong code, wrong password, unknown account, no enrolment, closed account, customer, merchant, driver: one answer", async () => {
    ip = "10.30.3.1";
    const staff = await make("agent");
    const wrongCode = codeAt(staff) === "000000" ? "111111" : "000000";
    const answers = [
      refusal(await staffSignIn(staff, wrongCode)),
      refusal(await staffSignIn(staff, codeAt(staff), "wrong password")),
      refusal(await staffSignIn(staff, codeAt(staff), PASSWORD, "nobody@fastgo.example")),
      refusal(await staffSignIn(await make("agent", { enrol: false }), "123456")),
      refusal(await (async () => { const c = await make("agent", { status: "closed" }); return staffSignIn(c, codeAt(c)); })()),
    ];
    for (const role of ["individual", "merchant", "driver"]) {
      const p = await make(role, { enrol: true }); // even with a secret on file, the role is not a back-office role
      answers.push(refusal(await staffSignIn(p, codeAt(p))));
    }
    for (const a of answers) expect(a).toMatchObject(SAME_401);
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
  });

  it("POST /v1/sessions refuses every staff role with the right password, always, and still signs a customer in", async () => {
    ip = "10.30.3.2";
    for (const role of ["agent", "admin", "cashier", "management"]) {
      const who = await make(role);
      const res = await call("POST", "/v1/sessions", { body: { identifier: who.email, password: PASSWORD } });
      expect([role, refusal(res)]).toEqual([role, expect.objectContaining(SAME_401)]);
    }
    const customer = await make("individual");
    expect((await call("POST", "/v1/sessions", { body: { identifier: customer.email, password: PASSWORD } })).statusCode).toBe(201);
  });
});

describe("GH-25 T60: audit, with no code and no secret", () => {
  it("writes one event per success and per refusal, with the reason, and nothing secret", async () => {
    ip = "10.30.4.1";
    const who = await make("accountant");
    const code = codeAt(who);
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await staffSignIn(who, wrong)).statusCode).toBe(401);
    expect((await staffSignIn(who, code, "wrong password")).statusCode).toBe(401);
    expect((await staffSignIn(who, code)).statusCode).toBe(201);
    expect((await staffSignIn(who, code)).statusCode).toBe(401); // replay
    const rows = (await q("select action, entity, entity_id, details from gestion.audit_events where entity_id = $1 and action like 'staff.signin%' order by at, id", [who.id])).rows;
    expect(rows.map((r) => [r.action, r.details.reason ?? null])).toEqual([
      ["staff.signin.refused", "code"],
      ["staff.signin.refused", "password"],
      ["staff.signin", null],
      ["staff.signin.refused", "replay"],
    ]);
    const text = JSON.stringify(rows);
    for (const secret of [code, wrong, base32Encode(who.secret), who.secret.toString("hex"), PASSWORD, who.email]) expect(text).not.toContain(secret);
  });

  it("an unknown account and a customer are audited without naming the identifier", async () => {
    ip = "10.30.4.2";
    const before = Number((await q("select count(*) as n from gestion.audit_events where action = 'staff.signin.refused'")).rows[0].n);
    await staffSignIn({ id: "", email: "ghost@fastgo.example", secret: newSecret() }, "123456");
    const customer = await make("individual");
    await staffSignIn(customer, codeAt(customer));
    const rows = (await q("select entity_id, details from gestion.audit_events where action = 'staff.signin.refused' order by at desc, id desc limit 2")).rows;
    expect(Number((await q("select count(*) as n from gestion.audit_events where action = 'staff.signin.refused'")).rows[0].n)).toBe(before + 2);
    expect(JSON.stringify(rows)).not.toContain("ghost@fastgo.example");
    expect(JSON.stringify(rows)).not.toContain(customer.email);
  });
});

describe("GH-25 R102: the attempts are limited per account and per IP", () => {
  it("the 6th attempt on one identifier is 429 with Retry-After, even with the right code", async () => {
    ip = "10.30.5.1";
    const who = await make("agent");
    for (let i = 0; i < 5; i += 1) expect((await staffSignIn(who, "000000", "wrong password")).statusCode).toBe(401);
    const blocked = await staffSignIn(who, codeAt(who));
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("20 attempts from one IP on different identifiers are the limit of that IP", async () => {
    ip = "10.30.5.2";
    for (let i = 0; i < 20; i += 1) await staffSignIn({ id: "", email: `ghost${i}@fastgo.example`, secret: newSecret() }, "123456");
    const who = await make("agent");
    expect((await staffSignIn(who, codeAt(who))).statusCode).toBe(429);
  });
});
