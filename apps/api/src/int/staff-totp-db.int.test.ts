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
const enrol = (id: string, tag = "x") => operator.query("select core.staff_totp_enrol($1::uuid, $2::bytea)", [id, secret(tag)]);
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
    ((await app().withNoActor((tx) => tx.execute(sql`select core.staff_totp_secret(${id}::uuid) as s`))).rows[0] as { s: Buffer | null }).s;

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

describe("GH-25 T60: enrolment (migrator login only)", () => {
  it("enrols an active back-office account once, and audits it without the secret", async () => {
    const id = await account("operations");
    await enrol(id, "audit-check");
    const row = await one("select enrolled_at, last_step from core.staff_totp where account_id = $1", [id]);
    expect(row.last_step).toBe("0");
    const audit = await one("select actor_id, action, entity, entity_id, details from gestion.audit_events where entity_id = $1 and action = 'staff.totp.enrolled'", [id]);
    expect(audit).toMatchObject({ actor_id: null, entity: "account", entity_id: id });
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
    await expectDbError(app().withNoActor((tx) => tx.execute(sql`select core.staff_totp_enrol(${id}::uuid, ${secret("x")}::bytea)`)), /permission denied/);
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
      ["staff_totp_reset", "fastgo_staff_auth", true, false, true, false, false],
      ["staff_totp_secret", "fastgo_staff_auth", true, true, false, false, false],
      ["staff_totp_use", "fastgo_staff_auth", true, true, false, false, false],
    ]);
    for (const f of r.rows) expect(f.cfg, f.proname).toContain("search_path=pg_catalog, core");
  });
});
