import { EventEmitter } from "node:events";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { authOptions } from "../auth/wiring.ts";
import { createRedis } from "../auth/redis.ts";
import { FakeSmsSender } from "../auth/sms.ts";
import { Db } from "../db/index.ts";
import { apiShutdownSteps, workerShutdownSteps } from "../lifecycle.ts";
import { ordersOptions } from "../orders/wiring.ts";
import { mergeOptions, pricingOptions } from "../pricing/wiring.ts";
import { onShutdown } from "../shutdown.ts";
import { startWorkerLoops } from "../worker-loops.ts";
import { startRedis, startTestDb, type TestDb } from "./harness.ts";

// GH-118: SIGTERM on the api and the worker, in-process (a fake signal source and a fake exit, so it runs on
// Windows too). The real signal is in shutdown-spawn.int.test.ts. The database is held with a lock taken by the
// test's own connection, so a request or a job is really in flight when the signal comes.

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => Promise<boolean>, what: string, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await settle(25);
  }
  await fresh();
  const activity = await testDb.superClient.query(
    "select usename, state, wait_event_type, left(query, 70) as q from pg_stat_activity where datname = 'fastgo' and pid <> pg_backend_pid()",
  );
  throw new Error(`Timed out waiting for: ${what}. Activity: ${JSON.stringify(activity.rows)}`);
}

/** The fake process: signals are an emitter, exit records its code. */
function fakeProcess() {
  const signals = new EventEmitter();
  const exits: number[] = [];
  const logged: Array<Record<string, unknown>> = [];
  let done!: (code: number) => void;
  const exited = new Promise<number>((resolve) => (done = resolve));
  return {
    signals,
    exits,
    logged,
    exited,
    options: {
      signals,
      log: (e: Record<string, unknown>) => logged.push(e),
      exit: (code: number) => {
        exits.push(code);
        done(code);
      },
    },
  };
}

let testDb: TestDb;
let stopRedis: () => Promise<void>;
let redisUrl: string;
beforeAll(async () => {
  testDb = await startTestDb();
  const r = await startRedis();
  redisUrl = r.url;
  stopRedis = r.stop;
});
afterAll(async () => {
  await stopRedis?.();
  await testDb?.stop();
});

const q = (text: string, values: unknown[] = []) => testDb.superClient.query(text, values);
// The test holds a transaction (it takes the lock): inside one, pg_stat_activity is a snapshot taken at its first read.
const fresh = async () => void (await q("select pg_stat_clear_snapshot()"));
async function connectionsOf(login: string): Promise<number> {
  await fresh();
  const r = await q("select count(*)::int as n from pg_stat_activity where usename = $1 and pid <> pg_backend_pid()", [login]);
  return Number(r.rows[0].n);
}
async function waitingOf(login: string): Promise<number> {
  await fresh();
  const r = await q("select count(*)::int as n from pg_stat_activity where usename = $1 and wait_event_type = 'Lock'", [login]);
  return Number(r.rows[0].n);
}

describe("GH-118: the api stops taking requests, finishes the one in flight, then closes redis and the database", () => {
  let db: Db;
  let redis: Redis;
  let app: NestFastifyApplication;
  let base: string;
  beforeAll(async () => {
    db = new Db(testDb.url("fastgo_app"), 4);
    redis = createRedis(redisUrl);
    // The same parts as main.ts: auth, pricing and orders over one Db and one Redis.
    const deps = { db, redis, authSecret: "s".repeat(40) };
    const auth = authOptions({ nodeEnv: "test", allowedOrigins: [], staffSignIn: false }, deps);
    const merged = mergeOptions(
      auth,
      pricingOptions(deps),
      ordersOptions({ ...deps, webUrl: "https://app.gofast.example" }),
    );
    app = await createApp(
      { trustProxy: false },
      { ...auth, controllers: merged.controllers, providers: merged.providers },
    );
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  });

  it("answers the request in flight in full, refuses a new one, exits 0, leaves no connection, closes redis", async () => {
    const proc = fakeProcess();
    onShutdown("api", apiShutdownSteps({ app, redis, db }), proc.options);

    // Hold core.orders: the tracking lookup now waits in the database, inside a request.
    await q("begin");
    await q("lock table core.orders in access exclusive mode");
    let inFlight: Promise<Response>;
    try {
      inFlight = fetch(`${base}/v1/tracking/FG-ZZZZ-0000`);
      await until(
        async () => (await waitingOf("fastgo_app")) >= 1,
        "the request to wait on the lock",
      );

      proc.signals.emit("SIGTERM");
      await settle(300);
      expect(proc.exits, "the process must wait for the request in flight").toEqual([]);

      // Stopped taking requests: a new connection is refused.
      const refused = await fetch(`${base}/v1/tracking/FG-ZZZZ-0001`).then(
        () => "answered",
        (e: { cause?: { code?: string } }) => e.cause?.code ?? "failed",
      );
      expect(refused).toBe("ECONNREFUSED");
    } finally {
      await q("rollback"); // release the lock
    }

    // The request in flight gets its whole answer: the database and redis were still open for it.
    const res = await inFlight;
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(await proc.exited, JSON.stringify(proc.logged)).toBe(0);
    expect(await connectionsOf("fastgo_app")).toBe(0);
    expect(redis.status).toBe("end");
  });
});

describe("GH-118: the worker finishes the pass in flight, starts no other, then closes the database", () => {
  it("SIGTERM during a blocked purge: no new pass, the pass ends, exit 0, no connection left", async () => {
    const workerDb = new Db(testDb.url("fastgo_worker"), 4);
    const expired = (scope: string, hours: number) =>
      q(
        `insert into core.idempotency_keys (scope, fingerprint, token, locked_until, expires_at, status, response_status, body)
         values ($1, 'fp', gen_random_uuid(), now(), now() + make_interval(hours => $2), 'done', 201, '{}')`,
        [scope, hours],
      );
    // A is held by the test, B would be deleted in the same pass, C is not expired (RV-24: only what is past its time).
    await expired("shutdown-A", -2);
    await expired("shutdown-B", -2);
    await expired("shutdown-C", 5);
    const loops = startWorkerLoops(
      workerDb,
      { sender: new FakeSmsSender() },
      { smsMs: 600_000, quotesMs: 600_000, idempotencyMs: 40 },
    );
    const proc = fakeProcess();
    onShutdown("worker", workerShutdownSteps({ loops, db: workerDb }), proc.options);

    await q("begin");
    await q("select 1 from core.idempotency_keys where scope = 'shutdown-A' for update");
    try {
      await until(
        async () => (await waitingOf("fastgo_worker")) >= 1,
        "a purge pass to wait on the locked row",
      );
      proc.signals.emit("SIGTERM");
      await settle(300);
      expect(proc.exits, "the process must wait for the pass in flight").toEqual([]);
    } finally {
      await q("rollback");
    }

    expect(await proc.exited).toBe(0);
    const left = (
      await q(
        "select scope from core.idempotency_keys where scope like 'shutdown-%' order by scope",
      )
    ).rows.map((r) => r.scope);
    expect(left, "A and B were purged by the pass that ended; C is not expired").toEqual([
      "shutdown-C",
    ]);
    expect(await connectionsOf("fastgo_worker")).toBe(0);

    // No pass starts after the stop: an expired key written now is still there a few intervals later.
    await expired("shutdown-D", -2);
    await settle(250);
    expect(
      (await q("select 1 from core.idempotency_keys where scope = 'shutdown-D'")).rowCount,
    ).toBe(1);
  });
});
