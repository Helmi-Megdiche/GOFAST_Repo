import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { createApp } from "./app.ts";
import { bootAuth } from "./auth/wiring.ts";
import { createRedis } from "./auth/redis.ts";
import { loadConfig, requireBackends } from "./config.ts";
import { Db } from "./db/index.ts";

const config = loadConfig();
const { databaseUrl, redisUrl, authSecret } = requireBackends(config);
const db = new Db(databaseUrl);
const redis = createRedis(redisUrl);
const app = await createApp(config, await bootAuth(config, { db, redis, authSecret }));
await app.listen(config.port, config.host);
new Logger("api").log(`listening on ${config.host}:${config.port}`);
