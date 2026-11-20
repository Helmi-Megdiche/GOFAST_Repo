import type { ShutdownStep } from "./shutdown.ts";

/**
 * What each process closes on SIGTERM, in this order. One list per process, shared by `main.ts` and
 * `worker.ts` and by the tests that send a fake signal, so the test closes what production closes.
 */

/**
 * Stops listening and lets the requests in flight finish: `app.close()` (Nest, then Fastify) never
 * cuts an active request, because Fastify's `forceCloseConnections` has no default (only `true` kills
 * sockets). But a keep-alive socket that was busy when the signal came stays open after its answer,
 * and `close()` would wait for it until Fastify's keep-alive timeout (72 s). So, while it waits, the
 * sockets that have gone idle are closed: a request in flight is never touched, an idle socket never lingers.
 */
export async function closeHttp(app: {
  close(): Promise<void>;
  getHttpServer(): { closeIdleConnections(): void };
}): Promise<void> {
  const server = app.getHttpServer();
  const sweep = setInterval(() => server.closeIdleConnections(), 50);
  try {
    await app.close();
  } finally {
    clearInterval(sweep);
  }
}

/** api: stop listening and let the requests in flight finish, then redis, then the database last. */
export function apiShutdownSteps(p: {
  app: { close(): Promise<void>; getHttpServer(): { closeIdleConnections(): void } };
  redis: { quit(): Promise<unknown> };
  db: { close(): Promise<void> };
}): ShutdownStep[] {
  return [
    { name: "http", run: () => closeHttp(p.app) },
    { name: "redis", run: async () => void (await p.redis.quit()) },
    { name: "db", run: () => p.db.close() },
  ];
}

/** worker: no new pass and the passes in flight end, then the health port, then the database last. */
export function workerShutdownSteps(p: {
  loops: { stop(): Promise<void> };
  health?: { close(): Promise<void> };
  db: { close(): Promise<void> };
}): ShutdownStep[] {
  const steps: ShutdownStep[] = [{ name: "jobs", run: () => p.loops.stop() }];
  if (p.health) steps.push({ name: "health", run: () => p.health!.close() });
  steps.push({ name: "db", run: () => p.db.close() });
  return steps;
}
