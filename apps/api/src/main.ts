import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.port, config.host);
new Logger("api").log(`listening on ${config.host}:${config.port}`);
