import "reflect-metadata";
import { loadConfig } from "./config.ts";
import { serveHealth } from "./health-server.ts";

// The `worker` process (outbox, SMS, queues, purge of expired idempotency keys) has no job yet:
// it arrives with the database (PR 3).
const config = loadConfig();
serveHealth("worker", config.workerPort, config.host);
