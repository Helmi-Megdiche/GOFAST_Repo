import { Logger } from "@nestjs/common";

/** One thing to close, in order. The name is what a failure is logged under: never data. */
export type ShutdownStep = { name: string; run: () => Promise<void> };

/** What `process` is for us: something that says "SIGTERM" and "SIGINT". Tests pass an emitter. */
export type SignalSource = { on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown };

export type ShutdownOptions = {
  /**
   * PROVISIONAL: how long the whole shutdown may take. Docker's stop grace is 10 s and then it sends
   * SIGKILL, so 8 s leaves the process time to log and exit by itself first. Not a business value.
   */
  hardLimitMs?: number;
  signals?: SignalSource;
  exit?: (code: number) => void;
  log?: (entry: Record<string, unknown>) => void;
};

/**
 * THE ONE OWNER of SIGTERM and SIGINT in a process (no `enableShutdownHooks()` next to it). On the
 * first signal it runs the steps in order, one at a time: stop taking work, let the work in flight
 * finish, then close what the work used (database last). A step that fails is logged by name and
 * error code only (an error message can hold a phone or a connection string) and the next step still
 * runs; the exit code is then 1. A second signal while shutting down is logged and ignored. After
 * `hardLimitMs` the process exits with 1 whatever a step is doing.
 */
export function onShutdown(
  name: string,
  steps: ShutdownStep[],
  options: ShutdownOptions = {},
): void {
  const hardLimitMs = options.hardLimitMs ?? 8_000;
  const signals: SignalSource = options.signals ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const logger = new Logger(name);
  const log =
    options.log ?? ((entry: Record<string, unknown>) => logger.log(JSON.stringify(entry)));

  let started = false;
  let exited = false;
  const leave = (code: number) => {
    if (exited) return;
    exited = true;
    exit(code);
  };

  const run = async (signal: string) => {
    if (started) {
      log({ event: "shutdown_signal_ignored", process: name, signal });
      return;
    }
    started = true;
    log({ event: "shutdown_started", process: name, signal });
    // Not unref'd: while the steps run, this timer is what guarantees the process ends.
    const hard = setTimeout(() => {
      log({ event: "shutdown_timeout", process: name });
      leave(1);
    }, hardLimitMs);
    let code = 0;
    for (const step of steps) {
      try {
        await step.run();
      } catch (error) {
        code = 1;
        const errorCode = (error as { code?: unknown })?.code;
        log({
          event: "shutdown_step_failed",
          process: name,
          step: step.name,
          code: typeof errorCode === "string" ? errorCode : "unknown",
        });
      }
    }
    clearTimeout(hard);
    log({ event: "shutdown_done", process: name, exit: code });
    leave(code);
  };

  signals.on("SIGTERM", () => void run("SIGTERM"));
  signals.on("SIGINT", () => void run("SIGINT"));
}
