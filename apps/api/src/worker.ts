import "reflect-metadata";
import { runSmsOutbox } from "./auth/outbox-worker.ts";
import { FakeSmsSender } from "./auth/sms.ts";
import { loadConfig } from "./config.ts";
import { Db } from "./db/index.ts";
import { serveHealth } from "./health-server.ts";

// The `worker` process: sends the SMS of the outbox (login `fastgo_worker`). Other jobs (queues,
// purge of expired idempotency keys) arrive with their PRs.
const config = loadConfig();
if (!config.databaseUrl) throw new Error("Missing environment: DATABASE_URL");
const db = new Db(config.databaseUrl);
const sender = new FakeSmsSender();
serveHealth("worker", config.workerPort, config.host);

const EVERY_MS = 2_000;
let running = false;
setInterval(() => {
  if (running) return;
  running = true;
  runSmsOutbox(db, sender)
    .catch(() => {
      /* the next pass retries; nothing is logged: the error could hold a phone */
    })
    .finally(() => {
      running = false;
    });
}, EVERY_MS).unref?.();
