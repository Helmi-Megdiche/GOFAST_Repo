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

/**
 * Start-up: builds the dummy hash first (sign-in of an unknown identifier does the same work as a
 * real one, R102), so the first request never pays for it or skips it.
 */
export async function bootAuth(
  config: Parameters<typeof authOptions>[0],
  deps: Parameters<typeof authOptions>[1],
): Promise<ReturnType<typeof authOptions>> {
  const passwords = deps.passwords ?? new Passwords();
  await passwords.ready();
  return authOptions(config, { ...deps, passwords });
}

/** Everything PR 4a adds to the HTTP app: the controller, the Redis session, the CSRF check. */
export function authOptions(
  config: Pick<Config, "nodeEnv" | "allowedOrigins" | "staffSignIn">,
  deps: { db: Db; redis: Redis; authSecret: string; now?: () => Date; passwords?: Passwords },
): Pick<AppOptions, "controllers" | "providers" | "sessions" | "owners" | "csrf"> {
  const cookieName = cookieNameFor(config.nodeEnv);
  const keys = new Keys(deps.authSecret);
  const store = new SessionStore(deps.redis, deps.now ? () => deps.now!().getTime() : undefined);
  const passwords = deps.passwords ?? new Passwords();
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
