import { describe, expect, it } from "vitest";
import { serveHealth } from "./health-server.ts";

const freePort = async () => {
  const { createServer } = await import("node:net");
  return new Promise<number>((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
};

describe("serveHealth (#118): it answers /health and closes on request, with no signal handling of its own", () => {
  it("answers 200, then close() resolves and the port refuses", async () => {
    const port = await freePort();
    const before = process.listenerCount("SIGTERM") + process.listenerCount("SIGINT");
    const health = serveHealth("worker", port, "127.0.0.1");
    await new Promise((r) => setTimeout(r, 100));
    // It no longer installs a SIGTERM/SIGINT handler: the process owns the signals (shutdown.ts).
    expect(process.listenerCount("SIGTERM") + process.listenerCount("SIGINT")).toBe(before);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", process: "worker" });

    await health.close();
    const after = await fetch(`http://127.0.0.1:${port}/health`).then(
      () => "answered",
      (e: { cause?: { code?: string } }) => e.cause?.code ?? "failed",
    );
    expect(after).toBe("ECONNREFUSED");
  });

  it("close() resolves even with an idle keep-alive connection open", async () => {
    const port = await freePort();
    const health = serveHealth("ws", port, "127.0.0.1");
    await new Promise((r) => setTimeout(r, 100));
    await fetch(`http://127.0.0.1:${port}/health`); // undici keeps the socket alive
    await expect(
      Promise.race([
        health.close().then(() => "closed"),
        new Promise((r) => setTimeout(() => r("hung"), 3_000)),
      ]),
    ).resolves.toBe("closed");
  });
});
