import type { AppOptions } from "../app.module.ts";
import { Keys } from "../auth/crypto.ts";
import { RateLimiter } from "../auth/rate-limit.ts";
import type { Redis } from "../auth/redis.ts";
import type { Db } from "../db/index.ts";
import { PricingController } from "./pricing.controller.ts";
import { PricingRepo } from "./pricing.repo.ts";
import { PricingService } from "./pricing.service.ts";

/** What issue #10 adds to the HTTP app: the pricing controller and its service. */
export function pricingOptions(deps: {
  db: Db;
  redis: Redis;
  authSecret: string;
  now?: () => Date;
}): Pick<AppOptions, "controllers" | "providers"> {
  const service = new PricingService({
    store: new PricingRepo(deps.db) as never,
    keys: new Keys(deps.authSecret),
    limiter: new RateLimiter(deps.redis),
    now: deps.now,
  });
  return { controllers: [PricingController], providers: [{ provide: PricingService, useValue: service }] };
}

/** Merges the options of several modules into the one the app takes. */
export function mergeOptions(...parts: Pick<AppOptions, "controllers" | "providers">[]): Pick<AppOptions, "controllers" | "providers"> {
  return {
    controllers: parts.flatMap((p) => p.controllers ?? []),
    providers: parts.flatMap((p) => p.providers ?? []),
  };
}
