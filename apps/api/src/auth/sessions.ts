import type { CookieSerializeOptions } from "@fastify/cookie";
import { sql } from "drizzle-orm";
import { PROVISIONAL } from "../provisional.ts";
import type { Db } from "../db/index.ts";
import { type Actor, SessionResolver } from "../http/session.ts";
import type { Role } from "../http/spec.ts";
import { newSessionId, sessionKeyOf } from "./crypto.ts";
import type { Redis } from "./redis.ts";

const HOUR = 3_600_000;
const CUSTOMER_MS = PROVISIONAL.customerSessionDays * 24 * HOUR;
const STAFF_MS = PROVISIONAL.staffSessionHours * HOUR;

type Stored = { accountId: string; lastRefresh: number; fixed: boolean };

/**
 * Sessions in Redis. The browser holds a random id; Redis holds `sess:<sha256(id)>` with the account
 * id and two dates, nothing else (no role: RV-19, no phone: RV-18). A customer session slides (renewed
 * at most once an hour); a staff session is fixed.
 */
export class SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly now: () => number = Date.now,
  ) {}

  async create(accountId: string, staff: boolean): Promise<string> {
    const id = newSessionId();
    const ttl = staff ? STAFF_MS : CUSTOMER_MS;
    const key = sessionKeyOf(id);
    const value: Stored = { accountId, lastRefresh: this.now(), fixed: staff };
    await this.redis
      .multi()
      .set(key, JSON.stringify(value), "PX", ttl)
      .sadd(indexKey(accountId), key)
      .pexpire(indexKey(accountId), CUSTOMER_MS)
      .exec();
    return id;
  }

  async get(id: string): Promise<{ accountId: string } | null> {
    const key = sessionKeyOf(id);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    let s: Stored;
    try {
      s = JSON.parse(raw) as Stored;
    } catch {
      return null;
    }
    const now = this.now();
    if (!s.fixed && now - s.lastRefresh >= HOUR) {
      s.lastRefresh = now;
      await this.redis.set(key, JSON.stringify(s), "PX", CUSTOMER_MS);
    }
    return { accountId: s.accountId };
  }

  async destroy(id: string): Promise<void> {
    const key = sessionKeyOf(id);
    const raw = await this.redis.get(key);
    await this.redis.del(key);
    if (raw) {
      try {
        await this.redis.srem(indexKey((JSON.parse(raw) as Stored).accountId), key);
      } catch {
        /* a broken value is already deleted */
      }
    }
  }

  /** Every session of the account, at once (reset, password change). Returns how many were open. */
  async destroyAll(accountId: string): Promise<number> {
    const index = indexKey(accountId);
    const keys = await this.redis.smembers(index);
    if (keys.length > 0) await this.redis.del(...keys);
    await this.redis.del(index);
    return keys.length;
  }
}

const indexKey = (accountId: string) => `sess-by:${accountId}`;

/** `__Host-session` in production (a cookie that no sub-domain can set), `session` in development. */
export function cookieNameFor(nodeEnv: string): string {
  return nodeEnv === "production" ? `__Host-${PROVISIONAL.cookieName}` : PROVISIONAL.cookieName;
}

/** Secure always: browsers accept it on localhost. No Domain: the `__Host-` prefix forbids it. */
export function sessionCookieOptions(staff: boolean): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: (staff ? STAFF_MS : CUSTOMER_MS) / 1000,
  };
}

export const STAFF_ROLES: ReadonlySet<Role> = new Set([
  "agent",
  "operations",
  "logistics",
  "customer_service",
  "accountant",
  "management",
  "admin",
  "driver",
  "cashier",
]);

/** The actor of a request: the stored session says who, the stored account says what they are now (RV-19). */
export class RedisSessions extends SessionResolver {
  constructor(
    private readonly store: SessionStore,
    private readonly db: Db,
    private readonly cookieName: string,
  ) {
    super();
  }

  override async resolve(cookies: Record<string, string | undefined>): Promise<Actor | null> {
    const id = cookies[this.cookieName];
    if (!id || id.length > 100) return null;
    const session = await this.store.get(id);
    if (!session) return null;
    const row = (
      await this.db.withNoActor((tx) =>
        tx.execute(sql`select role, status, company_id from core.session_account(${session.accountId}::uuid)`),
      )
    ).rows[0] as { role: Role; status: string; company_id: string | null } | undefined;
    if (!row || row.status !== "active") {
      await this.store.destroy(id);
      return null;
    }
    return toActor(session.accountId, row.role, row.company_id);
  }
}

/** A merchant acts for their company (`accountId` is the company); everyone else for themselves. */
export function toActor(accountId: string, role: Role, companyId: string | null): Actor | null {
  if (role === "merchant") {
    return companyId ? { accountId: companyId, userId: accountId, role } : null;
  }
  return { accountId, userId: accountId, role };
}
