import { execFile } from "node:child_process";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { Db } from "../db/index.ts";
import { bundledSpecPath } from "../http/spec.ts";
import { pricingOptions } from "../pricing/wiring.ts";
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
    `insert into core.zones (name, governorate, area) values
       ('Alpha', 'Tunis', ST_Multi(ST_GeomFromText('POLYGON((10 36, 10.1 36, 10.1 36.1, 10 36.1, 10 36))', 4326))::geography),
       ('Bravo', 'Ariana', ST_Multi(ST_GeomFromText('POLYGON((10.1 36, 10.2 36, 10.2 36.1, 10.1 36.1, 10.1 36))', 4326))::geography)`,
  );
  app = await createApp({ trustProxy: false }, pricingOptions({ db, redis, authSecret: "s".repeat(40) }));
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
// OPEN (GH-10, asked in the report): `createQuote` is not in the list yet. Schemathesis' check
// `positive_data_acceptance` (ST202) fails on it because a schema-valid body with no pin and no zone_id is
// answered 422 `addressUnconfirmed` (R201), a cross-field rule the schema cannot express. Allowing 422 for
// that one operation changes a check, so it waits for the senior's decision.
const IMPLEMENTED = ["getHealth", "listServices", "createZoneCheck", "getQuote"];

describe("Schemathesis against the contract", () => {
  it("finds no difference on the implemented operations", async () => {
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
      // An undeclared method answers 404 NOT_FOUND, not 405: the cahier has no 405 (open question on #7).
      "--exclude-checks",
      "unsupported_method",
      ...IMPLEMENTED.flatMap((id) => ["--include-operation-id", id]),
    ];
    const result = await run("docker", args, { timeout: 150_000 }).catch((e) => e);
    // A non-zero exit code makes `run` throw: the check can fail.
    expect(result.code, `${result.stdout ?? ""}\n${result.stderr ?? ""}`).toBeUndefined();
  });
});
