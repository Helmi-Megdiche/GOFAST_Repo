import "reflect-metadata";
import { runSmsOutbox } from "./auth/outbox-worker.ts";
import { FakeSmsSender } from "./auth/sms.ts";
import { loadConfig } from "./config.ts";
import { Db } from "./db/index.ts";
import { serveHealth } from "./health-server.ts";
import { runTrackingSms } from "./orders/tracking-sms.ts";
import { purgeExpiredQuotes, QUOTE_PURGE_EVERY_MS } from "./pricing/quote-purge.ts";

// The `worker` process: sends the SMS of the outbox and purges the expired quotes (login `fastgo_worker`).
// Other jobs (queues, purge of expired idempotency keys) arrive with their PRs.
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
    .then(() => (config.publicWebUrl ? runTrackingSms(db, sender, config.publicWebUrl) : undefined))
    .catch(() => {
      /* the next pass retries; nothing is logged: the error could hold a phone */
    })
    .finally(() => {
      running = false;
    });
}, EVERY_MS).unref?.();

let purging = false;
setInterval(() => {
  if (purging) return;
  purging = true;
  purgeExpiredQuotes(db)
    .catch(() => {
      /* the next pass retries */
    })
    .finally(() => {
      purging = false;
    });
}, QUOTE_PURGE_EVERY_MS).unref?.();
