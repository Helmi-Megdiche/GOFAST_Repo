import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { loadConfig } from "./config.ts";

// The `worker` process (outbox, SMS, queues) has no job yet: it arrives with the database (PR 3).
loadConfig();
new Logger("worker").log("no job yet");
