import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { onShutdown } from "./shutdown.ts";

/** A fake process: signals are an emitter, exit records its code and tells the test it was called. */
function fakes() {
  const signals = new EventEmitter();
  const logged: Array<Record<string, unknown>> = [];
  const exits: number[] = [];
  let done!: (code: number) => void;
  const exited = new Promise<number>((resolve) => (done = resolve));
  return {
    signals,
    logged,
    exits,
    exited,
    options: {
      signals,
      log: (e: Record<string, unknown>) => logged.push(e),
      exit: (code: number) => {
        exits.push(code);
        done(code);
      },
    },
  };
}
const timers = () => process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;

describe("onShutdown (#118): one owner for SIGTERM and SIGINT", () => {
  it("runs the steps in order, then exits 0", async () => {
    const f = fakes();
    const order: string[] = [];
    const step = (name: string, ms: number) => ({
      name,
      run: async () => {
        await new Promise((r) => setTimeout(r, ms));
        order.push(name);
      },
    });
    onShutdown("api", [step("server", 30), step("redis", 1), step("db", 1)], f.options);
    f.signals.emit("SIGTERM");
    expect(await f.exited).toBe(0);
    expect(order).toEqual(["server", "redis", "db"]); // the slow first step is finished before the next starts
  });

  it("answers SIGINT the same way", async () => {
    const f = fakes();
    onShutdown("worker", [{ name: "db", run: async () => undefined }], f.options);
    f.signals.emit("SIGINT");
    expect(await f.exited).toBe(0);
  });

  it("ignores a second signal while shutting down: logged, no second run, one exit", async () => {
    const f = fakes();
    let runs = 0;
    onShutdown(
      "api",
      [
        {
          name: "server",
          run: async () => {
            runs += 1;
            await new Promise((r) => setTimeout(r, 40));
          },
        },
      ],
      f.options,
    );
    f.signals.emit("SIGTERM");
    f.signals.emit("SIGINT");
    f.signals.emit("SIGTERM");
    await f.exited;
    expect(runs).toBe(1);
    expect(f.exits).toEqual([0]);
    expect(f.logged.filter((e) => e.event === "shutdown_signal_ignored")).toHaveLength(2);
  });

  it("a failing step is logged with its name and code only, the next steps still run, exit is 1", async () => {
    const f = fakes();
    const ran: string[] = [];
    const failure = Object.assign(
      new Error("connect to postgres://u:secret@h/db failed for +21620000001"),
      { code: "ECONNRESET" },
    );
    onShutdown(
      "api",
      [
        {
          name: "server",
          run: async () => {
            throw failure;
          },
        },
        {
          name: "redis",
          run: async () => {
            ran.push("redis");
          },
        },
        {
          name: "db",
          run: async () => {
            ran.push("db");
          },
        },
      ],
      f.options,
    );
    f.signals.emit("SIGTERM");
    expect(await f.exited).toBe(1);
    expect(ran).toEqual(["redis", "db"]);
    expect(f.logged).toContainEqual({
      event: "shutdown_step_failed",
      process: "api",
      step: "server",
      code: "ECONNRESET",
    });
    // no message, no phone, no connection string anywhere in what was logged
    expect(JSON.stringify(f.logged)).not.toMatch(/secret|postgres:|\+216/);
  });

  it("the hard limit logs one shutdown_timeout and exits 1, whatever a step is doing", async () => {
    const f = fakes();
    onShutdown("worker", [{ name: "jobs", run: () => new Promise<void>(() => undefined) }], {
      ...f.options,
      hardLimitMs: 40,
    });
    f.signals.emit("SIGTERM");
    expect(await f.exited).toBe(1);
    expect(f.logged.filter((e) => e.event === "shutdown_timeout")).toEqual([
      { event: "shutdown_timeout", process: "worker" },
    ]);
    expect(f.exits).toEqual([1]);
  });

  it("a clean run leaves no timer behind and logs no timeout", async () => {
    const before = timers();
    const f = fakes();
    onShutdown("api", [{ name: "db", run: async () => undefined }], {
      ...f.options,
      hardLimitMs: 60_000,
    });
    f.signals.emit("SIGTERM");
    await f.exited;
    expect(timers()).toBeLessThanOrEqual(before);
    expect(f.logged.some((e) => e.event === "shutdown_timeout")).toBe(false);
  });

  it("registers its listeners once per process name call, and does nothing before a signal", () => {
    const f = fakes();
    const ran: string[] = [];
    onShutdown(
      "ws",
      [
        {
          name: "health",
          run: async () => {
            ran.push("health");
          },
        },
      ],
      f.options,
    );
    expect(ran).toEqual([]);
    expect(f.exits).toEqual([]);
  });
});
