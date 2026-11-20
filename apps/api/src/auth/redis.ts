import { Redis } from "ioredis";

export type { Redis };

/** One connection for sessions, codes and counters. It fails fast instead of queueing forever. */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });
}
