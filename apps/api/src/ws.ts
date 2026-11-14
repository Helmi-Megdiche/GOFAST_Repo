import "reflect-metadata";
import { loadConfig } from "./config.ts";
import { serveHealth } from "./health-server.ts";

// The `ws` process (tracking and driver events) has no gateway yet: it arrives with its lot.
const config = loadConfig();
serveHealth("ws", config.wsPort, config.host);
