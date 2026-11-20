import { runSmsOutbox } from "./auth/outbox-worker.ts";
import type { SmsSender } from "./auth/sms.ts";
import type { Db } from "./db/index.ts";
import { IDEMPOTENCY_PURGE_EVERY_MS, purgeExpiredIdempotency } from "./http/idempotency-purge.ts";
import { runTrackingSms } from "./orders/tracking-sms.ts";
import { purgeExpiredQuotes, QUOTE_PURGE_EVERY_MS } from "./pricing/quote-purge.ts";

export type WorkerEvery = { smsMs: number; quotesMs: number; idempotencyMs: number };
export const WORKER_EVERY: WorkerEvery = {
  smsMs: 2_000,
  quotesMs: QUOTE_PURGE_EVERY_MS,
  idempotencyMs: IDEMPOTENCY_PURGE_EVERY_MS,
};

export type WorkerLoops = {
  /** Starts no new pass, then resolves when the passes already running have ended. */
  stop(): Promise<void>;
};

/**
 * The jobs of the `worker` process, each on its own interval and never overlapping itself: the SMS
 * outbox and the tracking SMS, the purge of the expired quotes, and the purge of the expired
 * idempotency keys (the stored answer of an order holds names, phones and addresses: it goes after
 * 24 h, with the scope of the order, R202). A failed pass is retried by the next one and nothing is
 * logged: the error could hold a phone. The jobs' own code is not here.
 */
export function startWorkerLoops(
  db: Db,
  deps: { sender: SmsSender; publicWebUrl?: string },
  every: WorkerEvery = WORKER_EVERY,
): WorkerLoops {
  const handles: NodeJS.Timeout[] = [];
  // The pass in flight of each loop, kept as a promise: stop() waits for it, not only for a flag.
  const inFlight = new Set<Promise<void>>();
  const loop = (ms: number, job: () => Promise<unknown>) => {
    let current: Promise<void> | undefined;
    const handle = setInterval(() => {
      if (current) return;
      current = job()
        .then(
          () => undefined,
          () => undefined, // the next pass retries
        )
        .finally(() => {
          inFlight.delete(pass);
          current = undefined;
        });
      const pass = current;
      inFlight.add(pass);
    }, ms);
    // The health server keeps the process alive; a timer must not.
    handle.unref();
    handles.push(handle);
  };

  loop(every.smsMs, () =>
    runSmsOutbox(db, deps.sender).then(() =>
      deps.publicWebUrl ? runTrackingSms(db, deps.sender, deps.publicWebUrl) : undefined,
    ),
  );
  loop(every.quotesMs, () => purgeExpiredQuotes(db));
  loop(every.idempotencyMs, () => purgeExpiredIdempotency(db));

  return {
    async stop() {
      for (const h of handles) clearInterval(h);
      await Promise.all([...inFlight]);
    },
  };
}
