import "reflect-metadata";
import { FakeSmsSender } from "./auth/sms.ts";
import { loadConfig } from "./config.ts";
import { Db } from "./db/index.ts";
import { serveHealth } from "./health-server.ts";
import { workerShutdownSteps } from "./lifecycle.ts";
import { onShutdown } from "./shutdown.ts";
import { startWorkerLoops } from "./worker-loops.ts";

// The `worker` process: sends the SMS of the outbox and purges the expired quotes and idempotency keys (login `fastgo_worker`).
// Other jobs (queues) arrive with their PRs. On SIGTERM it starts no new pass, lets the passes in flight end, closes its
// health port, then the database, and exits.
const config = loadConfig();
if (!config.databaseUrl) throw new Error("Missing environment: DATABASE_URL");
const db = new Db(config.databaseUrl);
const health = serveHealth("worker", config.workerPort, config.host);
const loops = startWorkerLoops(db, {
  sender: new FakeSmsSender(),
  publicWebUrl: config.publicWebUrl,
});
onShutdown("worker", workerShutdownSteps({ loops, health, db }));
