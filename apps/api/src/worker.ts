import "reflect-metadata";
import { runSmsOutbox } from "./auth/outbox-worker.ts";
import { FakeSmsSender } from "./auth/sms.ts";
import { loadConfig } from "./config.ts";
import { Db } from "./db/index.ts";
import { IDEMPOTENCY_PURGE_EVERY_MS, purgeExpiredIdempotency } from "./http/idempotency-purge.ts";
import { serveHealth } from "./health-server.ts";
import { runTrackingSms } from "./orders/tracking-sms.ts";
import { purgeExpiredQuotes, QUOTE_PURGE_EVERY_MS } from "./pricing/quote-purge.ts";

// The `worker` process: sends the SMS of the outbox and purges the expired quotes and idempotency keys (login `fastgo_worker`).
// Other jobs (queues) arrive with their PRs.
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

// The stored answer of an order (names, phones, addresses) is kept 24 h, then deleted with the scope of the order (R202).
let purgingKeys = false;
setInterval(() => {
  if (purgingKeys) return;
  purgingKeys = true;
  purgeExpiredIdempotency(db)
    .catch(() => {
      /* the next pass retries */
    })
    .finally(() => {
      purgingKeys = false;
    });
}, IDEMPOTENCY_PURGE_EVERY_MS).unref?.();
