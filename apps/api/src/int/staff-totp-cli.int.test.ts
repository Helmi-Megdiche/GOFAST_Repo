import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { base32Decode, decryptSecret, totpCode, totpStep, verifyTotp } from "../auth/totp.ts";
import { enrol, main, reset } from "../auth/staff-totp-cli.ts";
import { expectDbError, startTestDb, type TestDb } from "./harness.ts";

// GH-25 T60: the operator command, against the database, with the migrator login it uses in production.

const KEY = Buffer.alloc(32, 4);
let db: TestDb;
let client: pg.Client;
const q = (text: string, values: unknown[] = []) => db.superClient.query(text, values);
let seq = 0;
const account = async (role: string) => {
  seq += 1;
  const id = randomUUID();
  await q("insert into core.accounts (id, kind, role, full_name, phone_e164) values ($1, 'staff', $2, 'Test', $3)", [id, role, `+2162077${String(1000 + seq)}`]);
  return id;
};

beforeAll(async () => {
  db = await startTestDb();
  client = new pg.Client({ connectionString: db.url("fastgo_migrator") });
  await client.connect();
});
afterAll(async () => {
  await client?.end().catch(() => undefined);
  await db?.stop();
});

describe("GH-25 T60: staff:totp enrol", () => {
  it("prints an otpauth URI whose secret is the one stored, encrypted, and whose codes verify", async () => {
    const id = await account("agent");
    const uri = await enrol(client, KEY, id, "nadia@fastgo.tn");
    expect(uri).toMatch(/^otpauth:\/\/totp\/GOFAST:nadia%40fastgo\.tn\?secret=[A-Z2-7]+&issuer=GOFAST&algorithm=SHA1&digits=6&period=30$/);
    const printed = base32Decode(new URL(uri).searchParams.get("secret") as string);
    const stored = (await q("select secret_enc from core.staff_totp where account_id = $1", [id])).rows[0].secret_enc as Buffer;
    expect(stored.includes(printed)).toBe(false); // encrypted at rest
    expect(decryptSecret(stored, KEY, id).equals(printed)).toBe(true);
    const now = Date.now();
    expect(verifyTotp(printed, totpCode(printed, totpStep(now)), now)).toBe(totpStep(now));
  });

  it("refuses a second enrolment, and a customer, with no URI printed", async () => {
    const id = await account("operations");
    await enrol(client, KEY, id);
    await expectDbError(enrol(client, KEY, id), /already enrolled/i);
    const customer = randomUUID();
    await q("insert into core.accounts (id, kind, role, full_name) values ($1, 'customer', 'individual', 'C')", [customer]);
    await expectDbError(enrol(client, KEY, customer), /staff/i);
  });
});

describe("GH-25 T60 p.67: staff:totp reset", () => {
  it("resets for a second admin with a reason, and the account enrols again", async () => {
    const target = await account("agent");
    const admin = await account("admin");
    await enrol(client, KEY, target);
    await reset(client, target, admin, "Phone lost");
    expect((await q("select count(*)::int as n from core.staff_totp where account_id = $1", [target])).rows[0].n).toBe(0);
    expect((await q("select actor_id, details from gestion.audit_events where action = 'staff.totp.emergency_reset' and entity_id = $1", [target])).rows[0]).toMatchObject({
      actor_id: admin,
      details: { reason: "Phone lost" },
    });
    await enrol(client, KEY, target);
  });

  it("refuses the target as its own admin, a non-admin, and a blank reason", async () => {
    const target = await account("agent");
    const admin = await account("admin");
    await enrol(client, KEY, target);
    await expectDbError(reset(client, target, target, "self"), /second|own|itself|admin/i);
    await expectDbError(reset(client, target, await account("operations"), "not an admin"), /admin/i);
    await expectDbError(reset(client, target, admin, "  "), /reason/i);
  });
});

describe("GH-25: main() reports instead of throwing", () => {
  const env = (extra: Record<string, string | undefined> = {}) => ({ DATABASE_MIGRATOR_URL: db.url("fastgo_migrator"), TOTP_KEY: KEY.toString("base64"), ...extra });
  const out = () => {
    const lines: string[] = [];
    return { lines, log: (s: string) => lines.push(s), err: (s: string) => lines.push(`ERR ${s}`) };
  };

  it("prints the URI once and exits 0; a refusal exits 1 and prints no URI", async () => {
    const id = await account("logistics");
    const o = out();
    expect(await main(["enrol", id], env(), o)).toBe(0);
    expect(o.lines.filter((l) => l.startsWith("otpauth://"))).toHaveLength(1);
    const again = out();
    expect(await main(["enrol", id], env(), again)).toBe(1);
    expect(again.lines.some((l) => l.includes("otpauth://"))).toBe(false);
  });

  it("needs DATABASE_MIGRATOR_URL and a valid TOTP_KEY, and says which is missing", async () => {
    const o = out();
    expect(await main(["enrol", randomUUID()], env({ DATABASE_MIGRATOR_URL: undefined }), o)).toBe(1);
    expect(o.lines.join()).toMatch(/DATABASE_MIGRATOR_URL/);
    const k = out();
    expect(await main(["enrol", randomUUID()], env({ TOTP_KEY: "short" }), k)).toBe(1);
    expect(k.lines.join()).toMatch(/TOTP_KEY/);
    const u = out();
    expect(await main(["reset", randomUUID()], env(), u)).toBe(1);
    expect(u.lines.join()).toMatch(/usage|--by/i);
  });
});
