import type { AppOptions } from "../app.module.ts";
import { Keys } from "../auth/crypto.ts";
import { PhoneChecks } from "../auth/phone-check.ts";
import { RateLimiter } from "../auth/rate-limit.ts";
import type { Redis } from "../auth/redis.ts";
import type { Db } from "../db/index.ts";
import { PricingRepo } from "../pricing/pricing.repo.ts";
import { PricingService } from "../pricing/pricing.service.ts";
import { OrdersController } from "./orders.controller.ts";
import { OrdersRepo } from "./orders.repo.ts";
import { OrdersService } from "./orders.service.ts";

/** What GH-22 adds to the HTTP app: the order controller and its service. */
export function ordersOptions(deps: {
  db: Db;
  redis: Redis;
  authSecret: string;
  /** The public web origin of the tracking link in the SMS (Q5). Used by the worker, kept here for the config. */
  webUrl?: string;
  now?: () => Date;
  /** Tests force a collision of the tracking number (R203). */
  newTrackingNumber?: () => string;
}): Pick<AppOptions, "controllers" | "providers"> {
  const keys = new Keys(deps.authSecret);
  const limiter = new RateLimiter(deps.redis);
  const pricing = new PricingService({ store: new PricingRepo(deps.db) as never, keys, limiter, now: deps.now });
  const service = new OrdersService({
    port: new OrdersRepo(deps.db),
    priceAt: (spec, at) => pricing.priceAt(spec, at),
    keys,
    checks: new PhoneChecks(deps.redis, keys, deps.now ? () => deps.now!().getTime() : undefined),
    limiter,
    now: deps.now,
    newTrackingNumber: deps.newTrackingNumber,
  });
  return { controllers: [OrdersController], providers: [{ provide: OrdersService, useValue: service }] };
}
