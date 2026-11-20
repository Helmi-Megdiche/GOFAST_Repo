import { createServer } from "node:http";
import { Logger } from "@nestjs/common";

/**
 * The `ws` and `worker` processes have no job yet that needs a port, but a supervisor restarts a
 * process that exits, so each one stays alive and answers `GET /health` (not part of the public
 * contract). It does not watch signals: the process owns them (`shutdown.ts`) and calls `close()`
 * as one of its steps.
 */
export function serveHealth(name: string, port: number, host: string): { close(): Promise<void> } {
  const log = new Logger(name);
  const server = createServer((req, res) => {
    const ok = req.method === "GET" && req.url === "/health";
    res.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { status: "ok", process: name } : { error: "not_found" }));
  });
  server.listen(port, host, () => log.log(`up on ${host}:${port}, no job yet`));
  return {
    /** Stops listening and resolves when the connections still open have ended. */
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error && (error as { code?: string }).code !== "ERR_SERVER_NOT_RUNNING"
            ? reject(error)
            : resolve(),
        );
        server.closeIdleConnections();
      }),
  };
}
