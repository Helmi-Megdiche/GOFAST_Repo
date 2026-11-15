import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { PROVISIONAL } from "../provisional.ts";
import { type Answer, type Begin, IdempotencyStore } from "./idempotency.ts";

type Found = { status: string; fingerprint: string; response_status: number | null; body: unknown };

/**
 * The shared store (R202): one row per scope in `core.idempotency_keys`. `begin` is ONE statement,
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE <expired, or abandoned with the same content>`: of two
 * callers exactly one gets the row back. The clock is a parameter, never the database's now().
 */
export class DbIdempotencyStore extends IdempotencyStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
    private readonly lockMs = 300_000,
    /** The purge frees order scopes, which only the `fastgo_worker` login may do: the worker process passes its own Db. */
    private readonly workerDb: Db = db,
  ) {
    super();
  }

  override async begin(scope: string, fingerprint: string): Promise<Begin> {
    const now = new Date(this.now());
    const expiresAt = new Date(now.getTime() + PROVISIONAL.idempotencyHours * 3_600_000);
    const lockedUntil = new Date(now.getTime() + this.lockMs);
    const token = randomUUID();
    const account = scope.includes("|") ? scope.slice(0, scope.indexOf("|")) : null;
    return this.db.withNoActor(async (tx) => {
      const taken = await tx.execute(sql`
        insert into core.idempotency_keys as k
          (scope, account_id, fingerprint, token, locked_until, expires_at, status)
        values (${scope}, ${account === "anonymous" ? null : account}, ${fingerprint}, ${token},
                ${lockedUntil}, ${expiresAt}, 'running')
        on conflict (scope) do update set
          account_id = excluded.account_id, fingerprint = excluded.fingerprint, token = excluded.token,
          locked_until = excluded.locked_until, expires_at = excluded.expires_at,
          status = 'running', response_status = null, body = null
        where k.expires_at <= ${now}
           or (k.status = 'running' and k.locked_until <= ${now} and k.fingerprint = excluded.fingerprint)
        returning token`);
      if (taken.rows.length > 0) return { kind: "new", token } as const;
      const row = (
        await tx.execute(
          sql`select status, fingerprint, response_status, body from core.idempotency_keys where scope = ${scope}`,
        )
      ).rows[0] as Found | undefined;
      // The row vanished between the two statements (an abort): the caller asks again.
      if (!row) return { kind: "running" } as const;
      if (row.fingerprint !== fingerprint) return { kind: "conflict" } as const;
      if (row.status === "done") {
        return {
          kind: "replay",
          answer: { status: row.response_status ?? 200, body: row.body ?? undefined },
        } as const;
      }
      return { kind: "running" } as const;
    });
  }

  override async complete(scope: string, token: string, answer: Answer): Promise<boolean> {
    const r = await this.db.withNoActor((tx) =>
      tx.execute(sql`
        update core.idempotency_keys
           set status = 'done', response_status = ${answer.status},
               body = ${JSON.stringify(answer.body ?? null)}::jsonb
         where scope = ${scope} and token = ${token}`),
    );
    const stored = (r.rowCount ?? 0) > 0;
    // The lease was lost (the lock time ran out and another call took over): the answer is not stored.
    if (!stored) new Logger("idempotency").warn("lease lost: the answer was not stored (no scope in the log)");
    return stored;
  }

  override async abort(scope: string, token: string): Promise<void> {
    await this.db.withNoActor((tx) =>
      tx.execute(sql`delete from core.idempotency_keys where scope = ${scope} and token = ${token}`),
    );
  }

  override async purgeAccount(accountId: string): Promise<number> {
    const r = await this.db.withNoActor((tx) =>
      tx.execute(sql`delete from core.idempotency_keys where account_id = ${accountId}`),
    );
    return r.rowCount ?? 0;
  }

  override async purgeExpired(): Promise<number> {
    const now = new Date(this.now());
    return this.workerDb.withWorker(async (tx) => {
      // An order keeps its scope (unique) only as long as the key lives: free the scope first, so the
      // same key can create an order again once it has expired (R202).
      await tx.execute(sql`
        update core.orders set idempotency_scope = null
         where idempotency_scope in (select scope from core.idempotency_keys where expires_at <= ${now})`);
      const r = await tx.execute(sql`delete from core.idempotency_keys where expires_at <= ${now}`);
      return r.rowCount ?? 0;
    });
  }
}
