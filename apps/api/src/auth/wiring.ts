import type { AppOptions } from "../app.module.ts";
import type { Config } from "../config.ts";
import type { Db } from "../db/index.ts";
import type { SessionResolver, OwnerCheck } from "../http/session.ts";
import { AuthController } from "./auth.controller.ts";
import { AuthService } from "./auth.service.ts";
import { Keys } from "./crypto.ts";
import { Passwords } from "./password.ts";
import { PhoneChecks } from "./phone-check.ts";
import { RateLimiter } from "./rate-limit.ts";
import type { Redis } from "./redis.ts";
import { AuthOwners } from "./owners.ts";
import { cookieNameFor, RedisSessions, SessionStore } from "./sessions.ts";

/** Everything PR 4a adds to the HTTP app: the controller, the Redis session, the CSRF check. */
export function authOptions(
  config: Pick<Config, "nodeEnv" | "allowedOrigins" | "staffSignIn">,
  deps: { db: Db; redis: Redis; authSecret: string; now?: () => Date },
): Pick<AppOptions, "controllers" | "providers" | "sessions" | "owners" | "csrf"> {
  const cookieName = cookieNameFor(config.nodeEnv);
  const keys = new Keys(deps.authSecret);
  const store = new SessionStore(deps.redis);
  const passwords = new Passwords();
  const service = new AuthService({
    db: deps.db,
    keys,
    passwords,
    sessions: store,
    checks: new PhoneChecks(deps.redis, keys),
    limiter: new RateLimiter(deps.redis),
    staffSignIn: config.staffSignIn,
    now: deps.now,
  });
  return {
    controllers: [AuthController],
    providers: [{ provide: AuthService, useValue: service }],
    sessions: new RedisSessions(store, deps.db, cookieName) satisfies SessionResolver,
    owners: new AuthOwners() satisfies OwnerCheck,
    csrf: { cookieName, allowedOrigins: config.allowedOrigins },
  };
}
