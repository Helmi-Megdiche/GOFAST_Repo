import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { createApp } from "./app.ts";
import { bootAuth } from "./auth/wiring.ts";
import { createRedis } from "./auth/redis.ts";
import { mergeOptions, pricingOptions } from "./pricing/wiring.ts";
import { loadConfig, requireBackends } from "./config.ts";
import { Db } from "./db/index.ts";

const config = loadConfig();
const { databaseUrl, redisUrl, authSecret, totpKey } = requireBackends(config);
const db = new Db(databaseUrl);
const redis = createRedis(redisUrl);
const auth = await bootAuth(config, { db, redis, authSecret, totpKey });
const pricing = pricingOptions({ db, redis, authSecret });
const merged = mergeOptions(auth, pricing);
const app = await createApp(config, { ...auth, controllers: merged.controllers, providers: merged.providers });
await app.listen(config.port, config.host);
new Logger("api").log(`listening on ${config.host}:${config.port}`);
