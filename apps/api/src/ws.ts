import "reflect-metadata";
import { loadConfig } from "./config.ts";
import { serveHealth } from "./health-server.ts";
import { onShutdown } from "./shutdown.ts";

// The `ws` process (tracking and driver events) has no gateway and no database yet: it arrives with its lot.
// On SIGTERM it closes its health port and exits.
const config = loadConfig();
const health = serveHealth("ws", config.wsPort, config.host);
onShutdown("ws", [{ name: "health", run: () => health.close() }]);
