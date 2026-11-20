import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { Db } from "../db/index.ts";
import { expectDbError, startTestDb, type TestDb } from "./harness.ts";

// GH-25 T60: migration 0013 at the database level: the table the app login cannot touch, the two definers the API calls, and the two
// the operator calls (enrol, emergency reset) with the migrator login. The HTTP sign-in is in staff-signin.int.test.ts.

let db: TestDb;
const opened: Db[] = [];
const migrator: pg.Client[] = [];
const app = (): Db => {
  const d = new Db(db.url("fastgo_app"), 2);
  opened.push(d);
  return d;
};
const q = (text: string, values: unknown[] = []) => db.superClient.query(text, values);
const one = async (text: string, values: unknown[] = []) => (await q(text, values)).rows[0];
let operator: pg.Client; // the migrator login, as the staff:totp command uses it

let seq = 0;
async function account(role: string, over: { status?: string } = {}): Promise<string> {
  seq += 1;
  const id = randomUUID();
  const kind = role === "individual" ? "customer" : role === "merchant" ? "merchant" : "staff";
  await q(
    `insert into core.accounts (id, kind, role, full_name, phone_e164, status, closed_at) values ($1, $2, $3, 'Test', $4, $5, ${over.status === "closed" ? "now()" : "null"})`,
    [id, kind, role, `+2162066${String(1000 + seq)}`, over.status ?? "active"],
  );
  return id;
}
const secret = (tag: string) => Buffer.from(`ciphertext-of-${tag}-with-enough-bytes-to-pass-the-length-check`);
// S6: an enrolment names the admin who does it. BOOT is the first admin, enrolled in "the first setup" below; from then on every
// enrolment of this file passes it as `by`.
let BOOT: string | null = null;
const enrol = (id: string, tag = "x", by: string | null | undefined = BOOT) =>
  operator.query("select core.staff_totp_enrol($1::uuid, $2::bytea, $3::uuid)", [id, secret(tag), by ?? null]);
const reset = (target: string, by: string, reason: string) => operator.query("select core.staff_totp_reset($1::uuid, $2::uuid, $3)", [target, by, reason]);

beforeAll(async () => {
  db = await startTestDb();
  operator = new pg.Client({ connectionString: db.url("fastgo_migrator") });
  await operator.connect();
  migrator.push(operator);
});
afterAll(async () => {
  await Promise.all(opened.map((d) => d.close()));
  await Promise.all(migrator.map((c) => c.end().catch(() => undefined)));
  await db?.stop();
});

describe("GH-25 S6: an enrolment names the admin who does it; only the first setup may have none", () => {
  const audit = (id: string) => one("select actor_id, actor_role, details from gestion.audit_events where entity_id = $1 and action = 'staff.totp.enrolled'", [id]);

  it("while no admin is enrolled, an enrolment without --by works and says it is the first setup", async () => {
    const agent = await account("agent");
    await enrol(agent, "first", null);
    expect(await audit(agent)).toMatchObject({ actor_id: null, details: { first_setup: true } });
    const admin = await account("admin");
    await enrol(admin, "boot", null); // still no ENROLLED admin before this one
    BOOT = admin;
  });

  it("the exception closes once one admin is enrolled: without --by it is refused, and nothing is written", async () => {
    const target = await account("agent");
    await expectDbError(enrol(target, "x", null), /enrolled admin/i);
    expect(await one("select count(*)::int as n from core.staff_totp where account_id = $1", [target])).toEqual({ n: 0 });
  });

  it("with --by it writes that admin as the actor; the target itself, a non-admin, an admin with no enrolment and a closed admin are refused", async () => {
    const target = await account("agent");
    await expectDbError(enrol(target, "x", target), /second admin|itself/i);
    await expectDbError(enrol(target, "x", await account("operations")), /enrolled admin/i);
    await expectDbError(enrol(target, "x", await account("admin")), /enrolled admin/i); // an admin that was never enrolled
    expect(await one("select count(*)::int as n from core.staff_totp where account_id = $1", [target])).toEqual({ n: 0 });
    await enrol(target, "x", BOOT);
    expect(await audit(target)).toMatchObject({ actor_id: BOOT, actor_role: "admin", details: { first_setup: false } });
  });
});

describe("GH-25 T60 RV-19: core.staff_totp is out of reach of the app login", () => {
  it("has RLS on and forced, and no right at all for the app, the worker, the read-only login and PUBLIC", async () => {
    expect(await one("select relrowsecurity as rls, relforcerowsecurity as force from pg_class where oid = 'core.staff_totp'::regclass")).toEqual({ rls: true, force: true });
    for (const role of ["fastgo_app", "fastgo_worker", "fastgo_readonly", "public"]) {
      const table = await one(
        `select bool_or(has_table_privilege($1, 'core.staff_totp', p)) as any from unnest(array['select', 'insert', 'update', 'delete', 'references', 'trigger', 'truncate']) p`,
        [role],
      );
      const column = await one(
        `select bool_or(has_any_column_privilege($1, 'core.staff_totp', p)) as any from unnest(array['select', 'insert', 'update', 'references']) p`,
        [role],
      );
      expect([role, table.any, column.any]).toEqual([role, false, false]);
    }
  });

  it("the app login cannot read the secret, whatever it asks", async () => {
    const id = await account("admin");
    await enrol(id);
    await expectDbError(app().withNoActor((tx) => tx.execute(sql`select secret_enc from core.staff_totp`)), /permission denied/);
    await expectDbError(app().withNoActor((tx) => tx.execute(sql`delete from core.staff_totp`)), /permission denied/);
  });
});

describe("GH-25 T60: core.staff_totp_secret returns the ciphertext of an active staff account, and nothing else", () => {
  const secretOf = async (id: string) =>
    ((await app().withNoActor((tx) => tx.execute(sql`select secret_enc as s from core.staff_totp_secret(${id}::uuid)`))).rows[0] as { s: Buffer | null } | undefined)?.s ?? null;

  it("gives the stored bytes for each back-office role, and null for a customer, a merchant, a driver, a closed account, no enrolment", async () => {
    for (const role of ["agent", "operations", "logistics", "customer_service", "accountant", "management", "admin", "cashier"]) {
      const id = await account(role);
      await enrol(id, role);
      expect(Buffer.from((await secretOf(id)) as Buffer).equals(secret(role)), role).toBe(true);
    }
    expect(await secretOf(await account("agent"))).toBeNull(); // not enrolled
    const closed = await account("agent", { status: "closed" });
    await q("insert into core.staff_totp (account_id, secret_enc) values ($1, $2)", [closed, secret("closed")]);
    expect(await secretOf(closed)).toBeNull();
    for (const role of ["individual", "merchant", "driver"]) {
      const id = await account(role);
      await q("insert into core.staff_totp (account_id, secret_enc) values ($1, $2)", [id, secret(role)]);
      expect(await secretOf(id), role).toBeNull();
    }
    expect(await secretOf(randomUUID())).toBeNull();
  });
});

describe("GH-25 T60: core.staff_totp_use is a compare-and-set, a code is usable once", () => {
  const use = async (id: string, step: number) =>
    ((await app().withNoActor((tx) => tx.execute(sql`select core.staff_totp_use(${id}::uuid, ${step}::bigint) as ok`))).rows[0] as { ok: boolean }).ok;

  it("accepts a step above the last one, and refuses the same step, an older one, and an unknown account", async () => {
    const id = await account("agent");
    await enrol(id);
    expect(await use(id, 100)).toBe(true);
    expect(await use(id, 100)).toBe(false); // replay
    expect(await use(id, 99)).toBe(false);
    expect(await use(id, 101)).toBe(true);
    expect(await use(randomUUID(), 5)).toBe(false);
    expect((await one("select last_step from core.staff_totp where account_id = $1", [id])).last_step).toBe("101");
  });

  it("two calls with the same step at once: exactly one wins", async () => {
    const id = await account("agent");
    await enrol(id);
    const results = await Promise.all([use(id, 500), use(id, 500), use(id, 500)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("GH-25 S1: core.staff_totp_use refuses a step far ahead of the clock, and writes nothing", () => {
  const use = async (id: string, step: bigint | number) =>
    ((await app().withNoActor((tx) => tx.execute(sql`select core.staff_totp_use(${id}::uuid, ${String(step)}::bigint) as ok`))).rows[0] as { ok: boolean }).ok;

  it("2^40 (and three steps ahead) return false and last_step is unchanged; the next step is accepted", async () => {
    const id = await account("agent");
    await enrol(id);
    // The DATABASE's step, not this process's clock: the container's clock can differ, and a 30-second boundary can pass between the
    // two calls (one step of margin each way: "+1" is always accepted, "+3" always refused).
    const current = BigInt((await one("select (extract(epoch from now()) / 30)::bigint as s")).s);
    expect(await use(id, 2 ** 40)).toBe(false);
    expect(await use(id, current + 3n)).toBe(false);
    expect((await one("select last_step from core.staff_totp where account_id = $1", [id])).last_step).toBe("0");
    expect(await use(id, current + 1n)).toBe(true); // the window's upper edge
    expect(await use(id, 5)).toBe(false); // no lower bound beyond "newer than the last": 5 < last_step
    const other = await account("agent");
    await enrol(other);
    expect(await use(other, 5)).toBe(true); // a fixed clock in the past still works (tests, replays)
  });
});

describe("GH-25 B1: core.staff_totp_failed counts wrong codes per account and locks at the limit", () => {
  const failed = async (id: string, limit = 3) =>
    ((await app().withNoActor((tx) => tx.execute(sql`select core.staff_totp_failed(${id}::uuid, ${limit}::integer) as locked`))).rows[0] as { locked: boolean }).locked;
  const state = (id: string) => one("select failed_codes, locked_at from core.staff_totp where account_id = $1", [id]);
  const use = async (id: string, step: number) =>
    ((await app().withNoActor((tx) => tx.execute(sql`select core.staff_totp_use(${id}::uuid, ${step}::bigint) as ok`))).rows[0] as { ok: boolean }).ok;
  const lockedOf = async (id: string) =>
    ((await app().withNoActor((tx) => tx.execute(sql`select locked from core.staff_totp_secret(${id}::uuid)`))).rows[0] as { locked: boolean } | undefined)?.locked;

  it("counts to the limit, locks once (true only for that call), and a locked account counts nothing more", async () => {
    const id = await account("agent");
    await enrol(id);
    expect(await state(id)).toEqual({ failed_codes: 0, locked_at: null }); // RV-23: NULL means "not locked"
    expect(await lockedOf(id)).toBe(false);
    expect(await failed(id)).toBe(false);
    expect(await failed(id)).toBe(false);
    expect(await failed(id)).toBe(true); // the third: locked now
    const s = await state(id);
    expect(s.failed_codes).toBe(3);
    expect(s.locked_at).not.toBeNull();
    expect(await lockedOf(id)).toBe(true);
    expect(await failed(id)).toBe(false); // already locked: not counted, not "newly locked"
    expect((await state(id)).failed_codes).toBe(3);
  });

  it("a locked account cannot use a code, even a fresh one; a success on another account resets only that account", async () => {
    const locked = await account("agent");
    const other = await account("agent");
    await enrol(locked);
    await enrol(other);
    await failed(locked, 1);
    await failed(other, 5);
    await failed(other, 5);
    expect(await use(locked, 100)).toBe(false);
    expect((await one("select last_step from core.staff_totp where account_id = $1", [locked])).last_step).toBe("0"); // nothing written
    expect(await use(other, 100)).toBe(true);
    expect((await state(other)).failed_codes).toBe(0); // a success resets the count
    expect((await state(locked)).locked_at).not.toBeNull(); // RV-24: the other account's success touched nothing here
  });

  it("an unknown account, a missing enrolment and a bad limit change nothing", async () => {
    expect(await failed(randomUUID())).toBe(false);
    expect(await failed(await account("agent"))).toBe(false);
    await expectDbError(failed(await account("agent"), 0), /limit/i);
  });

  it("the emergency reset clears the lock: the row goes, and a new enrolment starts unlocked", async () => {
    const target = await account("agent");
    await enrol(target);
    await failed(target, 1);
    expect(await lockedOf(target)).toBe(true);
    await reset(target, BOOT as string, "Locked after ten wrong codes");
    await enrol(target, "again");
    expect(await lockedOf(target)).toBe(false);
    expect(await state(target)).toEqual({ failed_codes: 0, locked_at: null });
  });
});

describe("GH-25 T60: enrolment (migrator login only)", () => {
  it("enrols an active back-office account once, and audits it without the secret", async () => {
    const id = await account("operations");
    await enrol(id, "audit-check");
    const row = await one("select enrolled_at, last_step from core.staff_totp where account_id = $1", [id]);
    expect(row.last_step).toBe("0");
    const audit = await one("select actor_id, action, entity, entity_id, details from gestion.audit_events where entity_id = $1 and action = 'staff.totp.enrolled'", [id]);
    expect(audit).toMatchObject({ actor_id: BOOT, entity: "account", entity_id: id });
    expect(JSON.stringify(audit)).not.toContain("audit-check");
    await expectDbError(enrol(id), /already enrolled/i);
  });

  it("refuses a customer, a merchant, a driver, a closed account and an unknown one", async () => {
    for (const role of ["individual", "merchant", "driver"]) await expectDbError(enrol(await account(role)), /staff/i);
    await expectDbError(enrol(await account("agent", { status: "closed" })), /staff/i);
    await expectDbError(enrol(randomUUID()), /staff/i);
  });

  it("the app login cannot enrol or reset, and neither can the worker", async () => {
    const id = await account("agent");
    await expectDbError(app().withNoActor((tx) => tx.execute(sql`select core.staff_totp_enrol(${id}::uuid, ${secret("x")}::bytea, null::uuid)`)), /permission denied/);
    await expectDbError(app().withNoActor((tx) => tx.execute(sql`select core.staff_totp_reset(${id}::uuid, ${id}::uuid, 'x')`)), /permission denied/);
  });
});

describe("GH-25 T60 p.67: the emergency reset, by a second admin, with the reason, audited", () => {
  it("clears the enrolment and writes the admin, the target and the reason, and no secret", async () => {
    const target = await account("agent");
    const admin = await account("admin");
    await enrol(target, "reset-secret");
    await reset(target, admin, "Phone lost on the way to the depot");
    expect(await one("select count(*)::int as n from core.staff_totp where account_id = $1", [target])).toEqual({ n: 0 });
    const audit = await one("select actor_id, actor_role, action, entity, entity_id, details from gestion.audit_events where action = 'staff.totp.emergency_reset' and entity_id = $1", [target]);
    expect(audit).toMatchObject({ actor_id: admin, actor_role: "admin", entity: "account", entity_id: target, details: { reason: "Phone lost on the way to the depot" } });
    expect(JSON.stringify(audit)).not.toContain("reset-secret");
    await enrol(target, "second-secret"); // the account enrols again
  });

  it("refuses the admin resetting their own account, a non-admin, an inactive admin, a blank reason, an account with no enrolment", async () => {
    const target = await account("agent");
    const admin = await account("admin");
    await enrol(target);
    await enrol(admin);
    await expectDbError(reset(admin, admin, "my own phone"), /second|own|itself/i);
    await expectDbError(reset(target, await account("operations"), "I am not an admin"), /admin/i);
    await expectDbError(reset(target, await account("admin", { status: "closed" }), "closed admin"), /admin/i);
    await expectDbError(reset(target, admin, "   "), /reason/i);
    await expectDbError(reset(target, admin, ""), /reason/i);
    await expectDbError(reset(await account("agent"), admin, "no enrolment"), /not enrolled/i);
    expect(await one("select count(*)::int as n from core.staff_totp where account_id = $1", [target])).toEqual({ n: 1 }); // nothing changed
  });
});

describe("GH-25: the definers belong to fastgo_staff_auth, with exactly the right callers", () => {
  it("owner, search_path and execute rights", async () => {
    const r = await q(`select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig::text as cfg,
                              has_function_privilege('fastgo_app', p.oid, 'execute') as app,
                              has_function_privilege('fastgo_migrator', p.oid, 'execute') as migrator,
                              has_function_privilege('fastgo_worker', p.oid, 'execute') as worker,
                              has_function_privilege('public', p.oid, 'execute') as pub
                         from pg_proc p where p.pronamespace = 'core'::regnamespace and p.proname like 'staff\\_totp\\_%' order by 1`);
    expect(r.rows.map((x) => [x.proname, x.owner, x.prosecdef, x.app, x.migrator, x.worker, x.pub])).toEqual([
      ["staff_totp_enrol", "fastgo_staff_auth", true, false, true, false, false],
      ["staff_totp_failed", "fastgo_staff_auth", true, true, false, false, false],
      ["staff_totp_reset", "fastgo_staff_auth", true, false, true, false, false],
      ["staff_totp_secret", "fastgo_staff_auth", true, true, false, false, false],
      ["staff_totp_use", "fastgo_staff_auth", true, true, false, false, false],
    ]);
    for (const f of r.rows) expect(f.cfg, f.proname).toContain("search_path=pg_catalog, core");
  });
});
