import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { createApp } from "./app.ts";
import { bootAuth } from "./auth/wiring.ts";
import { createRedis } from "./auth/redis.ts";
import { ordersOptions } from "./orders/wiring.ts";
import { mergeOptions, pricingOptions } from "./pricing/wiring.ts";
import { loadConfig, requireBackends } from "./config.ts";
import { Db } from "./db/index.ts";
import { DbIdempotencyStore } from "./http/idempotency-db.ts";

const config = loadConfig();
const { databaseUrl, redisUrl, authSecret, totpKey } = requireBackends(config);
const db = new Db(databaseUrl);
const redis = createRedis(redisUrl);
const auth = await bootAuth(config, { db, redis, authSecret, totpKey });
const pricing = pricingOptions({ db, redis, authSecret });
const orders = ordersOptions({ db, redis, authSecret });
const merged = mergeOptions(auth, pricing, orders);
// R202: the answer of a keyed request is kept in the database, shared by every API process, and purged by the worker after 24 h.
const idempotency = new DbIdempotencyStore(db);
const app = await createApp(config, { ...auth, controllers: merged.controllers, providers: merged.providers, idempotency });
await app.listen(config.port, config.host);
new Logger("api").log(`listening on ${config.host}:${config.port}`);
