import { createServer, type Server } from "node:http";
import { Logger } from "@nestjs/common";

/**
 * The `ws` and `worker` processes have no job yet, but a supervisor restarts a process that exits,
 * so each one stays alive and answers `GET /health` (not part of the public contract). Closes on
 * SIGTERM and SIGINT.
 */
export function serveHealth(name: string, port: number, host: string): Server {
  const log = new Logger(name);
  const server = createServer((req, res) => {
    const ok = req.method === "GET" && req.url === "/health";
    res.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { status: "ok", process: name } : { error: "not_found" }));
  });
  server.listen(port, host, () => log.log(`up on ${host}:${port}, no job yet`));
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return server;
}
