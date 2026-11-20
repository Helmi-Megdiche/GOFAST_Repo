import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { build } from "tsup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startRedis, startTestDb, type TestDb } from "./harness.ts";

// GH-118: the real thing. A real `main.ts` process gets a real SIGTERM while a request is in flight.
// On Windows a SIGTERM ends a process at once and cannot be caught, so this test only runs where signals exist (CI).

// The same bundle as production (`node dist/main.js`, see tsup.config.ts). Node's type stripping cannot run Nest's decorators.
// It goes under node_modules/.cache so the bundle finds the packages it leaves external.
const OUT = join(process.cwd(), "node_modules", ".cache", "shutdown-spawn");

let testDb: TestDb;
let stopRedis: () => Promise<void>;
let redisUrl: string;
beforeAll(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await build({
    entry: { main: "src/main.ts" },
    outDir: OUT,
    format: ["esm"],
    target: "node24",
    platform: "node",
    clean: false,
    sourcemap: false,
    silent: true,
    noExternal: [/^@fastgo\//],
    external: ["@nestjs/microservices", "@nestjs/websockets", "class-validator", "class-transformer"],
  });
  testDb = await startTestDb();
  const r = await startRedis();
  redisUrl = r.url;
  stopRedis = r.stop;
});
afterAll(async () => {
  rmSync(OUT, { recursive: true, force: true });
  await stopRedis?.();
  await testDb?.stop();
});

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = (text: string, values: unknown[] = []) => testDb.superClient.query(text, values);

describe("GH-118: a real SIGTERM on the api process", () => {
  it.skipIf(process.platform === "win32")(
    "answers the request in flight, exits 0 and leaves no connection",
    async () => {
      const port = 20_000 + Math.floor(Math.random() * 20_000);
      const child = spawn(process.execPath, [join(OUT, "main.js")], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "development",
          HOST: "127.0.0.1",
          PORT: String(port),
          DATABASE_URL: testDb.url("fastgo_app"),
          REDIS_URL: redisUrl,
          AUTH_SECRET: "s".repeat(40),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (d: Buffer) => (output += d.toString()));
      child.stderr.on("data", (d: Buffer) => (output += d.toString()));
      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
        child.on("exit", (code, signal) => resolve({ code, signal })),
      );
      try {
        const up = Date.now() + 60_000;
        while (!output.includes("listening on")) {
          if (Date.now() > up)
            throw new Error(`The api did not start. Output: ${output.slice(-600)}`);
          await settle(100);
        }

        await q("begin");
        await q("lock table core.orders in access exclusive mode");
        let inFlight: Promise<Response>;
        try {
          inFlight = fetch(`http://127.0.0.1:${port}/v1/tracking/FG-ZZZZ-0000`);
          const waiting = Date.now() + 15_000;
          for (;;) {
            await q("select pg_stat_clear_snapshot()");
            const n = (
              await q(
                "select count(*)::int as n from pg_stat_activity where usename = 'fastgo_app' and wait_event_type = 'Lock'",
              )
            ).rows[0].n;
            if (n >= 1) break;
            if (Date.now() > waiting) throw new Error("The request never waited on the lock");
            await settle(50);
          }
          child.kill("SIGTERM");
          await settle(400);
          expect(child.exitCode, "the process must wait for the request in flight").toBeNull();
        } finally {
          await q("rollback");
        }

        const res = await inFlight;
        expect(res.status).toBe(404);
        const end = await Promise.race([exited, settle(15_000).then(() => "hung" as const)]);
        expect(end, `Output: ${output.slice(-800)}`).toEqual({ code: 0, signal: null });
        await q("select pg_stat_clear_snapshot()");
        expect(
          (await q("select count(*)::int as n from pg_stat_activity where usename = 'fastgo_app'"))
            .rows[0].n,
        ).toBe(0);
        expect(output).toContain("shutdown_done");
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    },
    120_000,
  );
});
