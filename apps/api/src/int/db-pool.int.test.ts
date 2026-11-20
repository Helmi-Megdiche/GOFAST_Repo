import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db } from "../db/index.ts";
import { startTestDb, type TestDb } from "./harness.ts";

/** Every error that reaches the process with nobody to catch it, until `stop()`. */
function watchUncaught() {
  const seen: unknown[] = [];
  const onError = (e: unknown) => seen.push(e);
  process.on("uncaughtException", onError);
  process.on("unhandledRejection", onError);
  return {
    seen,
    stop: () => {
      process.off("uncaughtException", onError);
      process.off("unhandledRejection", onError);
    },
  };
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sockets = () => process.getActiveResourcesInfo().filter((r) => r === "TCPSocketWrap").length;

describe("the pool survives the loss of an idle connection (follow-up of #110, part 1)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await startTestDb();
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("an idle client whose backend is killed is logged and dropped; the next query gets a new connection", async () => {
    const logged: Array<Record<string, unknown>> = [];
    const d = new Db(db.url("fastgo_app"), 2, (entry) => logged.push(entry));
    const watch = watchUncaught();
    try {
      // One query leaves one idle client in the pool.
      await d.withNoActor((tx) => tx.execute("select 1"));
      const killed = await db.superClient.query(
        `select pg_terminate_backend(pid) from pg_stat_activity
          where usename = 'fastgo_app' and datname = 'fastgo' and pid <> pg_backend_pid()`,
      );
      expect(killed.rowCount).toBeGreaterThan(0);
      await settle(500);

      expect(watch.seen).toEqual([]);
      expect(logged).toHaveLength(killed.rowCount ?? 0);
      expect(logged[0]).toMatchObject({ event: "db_pool_error", code: "57P01" });
      // No connection string, no password, in what is logged.
      expect(JSON.stringify(logged)).not.toMatch(/postgres:\/\/|app-test/);
      await expect(d.withNoActor((tx) => tx.execute("select 1 as one"))).resolves.toBeDefined();
    } finally {
      watch.stop();
      await d.close();
    }
  });
});

describe("close() leaves nothing open and the container stop raises no error (follow-up of #110, part 2)", () => {
  it("closes a Db with busy and idle clients, stops the database at once, and no error is unhandled", async () => {
    const own = await startTestDb();
    const watch = watchUncaught();
    try {
      const before = sockets();
      const d = new Db(own.url("fastgo_app"), 4);
      // Two clients idle, two busy at the moment of close().
      await Promise.all([1, 2].map(() => d.withNoActor((tx) => tx.execute("select pg_sleep(0.1)"))));
      const busy = [1, 2].map(() => d.withNoActor((tx) => tx.execute("select pg_sleep(0.3)")));
      await settle(50);
      await d.close();
      await Promise.allSettled(busy);

      // When close() resolves, no socket of the pool is left on this side (the harness stops the
      // container next: a socket still closing there is what raised 57P01 on #110).
      expect(sockets()).toBe(before);
      // ... and the server has no connection of this login left.
      const open = await own.superClient.query(
        "select count(*)::int as n from pg_stat_activity where usename = 'fastgo_app'",
      );
      expect(open.rows[0].n).toBe(0);
    } finally {
      await own.stop();
      await settle(1_000);
      watch.stop();
    }
    expect(watch.seen).toEqual([]);
  });
});
