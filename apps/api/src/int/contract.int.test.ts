import { execFile } from "node:child_process";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { SessionStore } from "../auth/sessions.ts";
import { authOptions } from "../auth/wiring.ts";
import { Db } from "../db/index.ts";
import { bundledSpecPath } from "../http/spec.ts";
import { ordersOptions } from "../orders/wiring.ts";
import { mergeOptions, pricingOptions } from "../pricing/wiring.ts";
import { startRedis, startTestDb, type TestDb } from "./harness.ts";

process.env.MSYS_NO_PATHCONV = "1";
const run = promisify(execFile);
let app: NestFastifyApplication;
let port: number;
let testDb: TestDb;
let db: Db;
let redis: Redis;
let stopRedis: () => Promise<void>;
let sessionCookie = "";
let staffCookie = "";
const ORIGIN = "https://gofast.example";
// The tracking number the contract gives as an example (common.yaml): Schemathesis tries examples first, so with this order in
// the database the 200 answer is tested too, not only the 404.
const EXAMPLE_TRACKING = "FG-7K4M-2QXP";

beforeAll(async () => {
  // The pricing routes need a database (zones, prices, quotes) and Redis (per-IP limits).
  testDb = await startTestDb();
  const r = await startRedis();
  stopRedis = r.stop;
  redis = createRedis(r.url);
  db = new Db(testDb.url("fastgo_app"), 4);
  // Not real délégations: two squares, so a generated pin or zone can be in zone as well as out of it.
  await testDb.superClient.query(
    `insert into core.zones (name, name_ar, name_en, governorate, area) values
       ('Alpha', 'ألفا', 'Alpha', 'Tunis', ST_Multi(ST_GeomFromText('POLYGON((10 36, 10.1 36, 10.1 36.1, 10 36.1, 10 36))', 4326))::geography),
       ('Bravo', 'برافو', 'Bravo', 'Ariana', ST_Multi(ST_GeomFromText('POLYGON((10.1 36, 10.2 36, 10.2 36.1, 10.1 36.1, 10.1 36))', 4326))::geography)`,
  );
  // GH-22: a customer with a session and an order (the example tracking number), so the order routes answer 200 too.
  const q = (text: string, values: unknown[] = []) => testDb.superClient.query(text, values);
  const account = (await q(
    `insert into core.accounts (kind, role, full_name, phone_e164, phone_verified_at) values ('customer', 'individual', 'Client Contrat', '+21620777001', now()) returning id`,
  )).rows[0].id as string;
  const zone = (await q("select id from core.zones where name = 'Alpha'")).rows[0].id as string;
  const address = (await q(`insert into core.addresses (owner_account_id, line, zone_id) values ($1, 'Rue du Contrat', $2) returning id`, [account, zone])).rows[0].id as string;
  const recipient = (await q(`insert into core.recipients (owner_account_id, name, phone_e164, address_id) values ($1, 'Destinataire Contrat', '+21620777002', $2) returning id`, [account, address])).rows[0].id as string;
  const order = (await q(
    `insert into core.orders (tracking_number, owner_account_id, created_by, service, payment_mode, freight_payer, total_millimes, pickup_address_id, recipient_id)
     values ($1, $2, $2, 'standard', 'cashPickup', 'sender', 10000, $3, $4) returning id`,
    [EXAMPLE_TRACKING, account, address, recipient],
  )).rows[0].id as string;
  await q(`insert into core.parcels (order_id, size, weight_declared_g, proof_level, position, barcode) values ($1, 'small', 800, 'codeOrPhotoWithPosition', 1, $2)`, [order, `${EXAMPLE_TRACKING}-1`]);
  await q(`insert into core.status_events (order_id, subject_type, subject_id, to_status, actor_id) values ($1, 'order', $1, 'received', $2)`, [order, account]);
  const deps = { db, redis, authSecret: "s".repeat(40) };
  const auth = authOptions({ nodeEnv: "test", allowedOrigins: [ORIGIN], staffSignIn: false }, deps);
  const merged = mergeOptions(auth, pricingOptions(deps), ordersOptions(deps));
  app = await createApp({ trustProxy: false }, { ...auth, controllers: merged.controllers, providers: merged.providers });
  const validFrom = (await q("select extract(epoch from sessions_valid_from)::text as v from core.accounts where id = $1", [account])).rows[0].v as string;
  sessionCookie = await new SessionStore(redis).create(account, false, validFrom);
  // GH-22 4b-2b: an agent, for confirmOrder (the customer's session is refused it with a documented 403).
  const agent = (await q(`insert into core.accounts (kind, role, full_name) values ('staff', 'agent', 'Agent Contrat') returning id`)).rows[0].id as string;
  const agentFrom = (await q("select extract(epoch from sessions_valid_from)::text as v from core.accounts where id = $1", [agent])).rows[0].v as string;
  staffCookie = await new SessionStore(redis).create(agent, true, agentFrom);
  await app.listen(0, "0.0.0.0");
  port = (app.getHttpServer().address() as AddressInfo).port;
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  redis?.disconnect();
  await stopRedis?.();
  await testDb?.stop();
});

// Schemathesis 4 tests the running API against the bundled contract. Only the operations that have a
// handler are included; each PR adds its own `--include-operation-id` as it lands (PR 4a, PR 4b).
const IMPLEMENTED = ["getHealth", "listServices", "createZoneCheck", "getQuote", "getTracking"];

/** One Schemathesis run over `ids`. A non-zero exit code makes `run` throw, so the check can fail. */
async function schemathesis(ids: string[], excludeChecks: string[], headers: string[] = []): Promise<void> {
  const args = [
    "run",
    "--rm",
    "--add-host",
    "host.docker.internal:host-gateway",
    "-v",
    `${bundledSpecPath()}:/spec.yaml:ro`,
    "schemathesis/schemathesis:4.33.4",
    "run",
    "/spec.yaml",
    "--url",
    `http://host.docker.internal:${port}`,
    "--checks",
    "all",
    "--exclude-checks",
    excludeChecks.join(","),
    ...headers.flatMap((h) => ["-H", h]),
    ...ids.flatMap((id) => ["--include-operation-id", id]),
  ];
  const result = await run("docker", args, { timeout: 150_000 }).catch((e) => e);
  expect(result.code, `${result.stdout ?? ""}
${result.stderr ?? ""}`).toBeUndefined();
}

describe("Schemathesis against the contract", () => {
  it("finds no difference on the implemented operations", async () => {
    // An undeclared method answers 404 NOT_FOUND, not 405: the cahier has no 405 (open question on #7).
    await schemathesis(IMPLEMENTED, ["unsupported_method"]);
  });

  // createQuote has its own run. A 422 RULE_REFUSED (`outOfZone`, `addressUnconfirmed`) depends on the state
  // of the database (the zones) and on a rule across two fields (an address with neither a pin nor a
  // zone_id), which the schema cannot express, so Schemathesis reads a schema-valid body answered 422 as
  // "rejected" (`positive_data_acceptance`, ST202). The contract documents that 422. Every other check
  // still runs on this operation: status codes, response schema, headers, content type, and that an
  // invalid body is rejected.
  it("finds no difference on createQuote, which may answer 422 for a valid body", async () => {
    await schemathesis(["createQuote"], ["unsupported_method", "positive_data_acceptance"]);
  });

  // GH-22: the order routes, signed in as a customer who owns an order. createOrder refuses a schema-valid body in many ways
  // that depend on the state (an unknown quote is 404, a moved grid or an unverified phone is 422), so, like createQuote, it
  // does not run `positive_data_acceptance`. `negative_data_rejection` is off too: the fixed Cookie header of this run is always
  // sent, so a request "missing the session cookie" is never made (the 401 is tested in orders.api.int.test.ts). A createOrder
  // body made by Schemathesis cannot match a stored quote, so its success path is tested there, with a real quote; here it
  // reaches the 404 and 422 answers. Every other check runs, and listOrders and getOrder answer 200 for the seeded order.
  it("finds no difference on the order routes, signed in", async () => {
    await schemathesis(["createOrder", "listOrders", "getOrder", "cancelOrder"], ["unsupported_method", "positive_data_acceptance", "negative_data_rejection"], [
      `Cookie: session=${sessionCookie}`,
      `Origin: ${ORIGIN}`,
    ]);
  });

  // confirmOrder is for staff: signed in as an agent, it answers 200 or 409 for the seeded order and 404 for the others.
  it("finds no difference on confirmOrder, signed in as an agent", async () => {
    await schemathesis(["confirmOrder"], ["unsupported_method", "positive_data_acceptance", "negative_data_rejection"], [
      `Cookie: session=${staffCookie}`,
      `Origin: ${ORIGIN}`,
    ]);
  });
});
