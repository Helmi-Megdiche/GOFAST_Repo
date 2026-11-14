import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { loadConfig } from "./config.ts";

// The `ws` process (tracking and driver events) has no gateway yet: it arrives with its lot.
loadConfig();
new Logger("ws").log("no gateway yet");
