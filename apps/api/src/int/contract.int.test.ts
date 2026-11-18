import { execFile } from "node:child_process";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { authOptions } from "../auth/wiring.ts";
import { Db } from "../db/index.ts";
import { bundledSpecPath } from "../http/spec.ts";
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
  // GH-25: the auth module too, for the staff sign-in route.
  const deps = { db, redis, authSecret: "s".repeat(40), totpKey: Buffer.alloc(32, 6) };
  const auth = authOptions({ nodeEnv: "test", allowedOrigins: ["https://backoffice.gofast.example"] }, deps);
  const merged = mergeOptions(auth, pricingOptions(deps));
  app = await createApp({ trustProxy: false }, { ...auth, controllers: merged.controllers, providers: merged.providers });
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
const IMPLEMENTED = ["getHealth", "listServices", "createZoneCheck", "getQuote"];

/** One Schemathesis run over `ids`. A non-zero exit code makes `run` throw, so the check can fail. */
async function schemathesis(ids: string[], excludeChecks: string[]): Promise<void> {
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

  // GH-25 T60: the staff sign-in answers 401 to a schema-valid body that is not a staff member with the right code, which Schemathesis
  // reads as "rejected" (`positive_data_acceptance`); the contract documents that 401, and 429 after the limits. Every other check runs.
  it("finds no difference on createStaffSession, which answers 401 for a valid body", async () => {
    await schemathesis(["createStaffSession"], ["unsupported_method", "positive_data_acceptance"]);
  });
});
