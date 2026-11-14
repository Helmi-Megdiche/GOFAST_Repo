import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Actor } from "../http/session.ts";
import * as schema from "./schema/core.ts";

/** What a query function receives: a typed handle that lives for one transaction. */
export type Tx = NodePgDatabase<typeof schema>;

/**
 * THE ONE DOOR to the database. Nothing outside `src/db` may import `pg` (lint), and this module
 * never exports the pool. Every query runs inside a transaction that first sets the identity with
 * one bound `select set_config(name, value, true)`: the cahier's SET LOCAL, safe under PgBouncer
 * in transaction mode because the setting dies with the transaction. A test refuses
 * `set_config(..., false)`, a bare SET, advisory locks and named prepared statements in the code.
 */
export class Db {
  private readonly pool: pg.Pool;

  constructor(url: string, max = 10) {
    this.pool = new pg.Pool({ connectionString: url, max });
  }

  /** A request of a signed-in person. RLS sees `actor` and nothing else. */
  withActor<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
    // A merchant acts for a company: `accountId` is the company then (session.ts).
    const company = actor.role === "merchant" ? actor.accountId : "";
    return this.run(fn, [actor.userId, company, actor.role]);
  }

  /** A call with nobody behind it (idempotency keys: a table without RLS). RLS tables read nothing. */
  withNoActor<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run(fn, ["", "", ""]);
  }

  /** A job of the worker process: its own login, its own policies, no person. */
  withWorker<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run(fn, ["", "", "worker"]);
  }

  /** Start-up check for the API and the worker: refuse a role that would skip RLS. */
  async assertSafeRole(): Promise<void> {
    const r = await this.pool.query<{ problems: string[] }>(
      `select array_remove(array[
         case when r.rolsuper then 'is a superuser' end,
         case when r.rolbypassrls then 'has BYPASSRLS' end,
         case when exists (
           select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('core', 'gestion') and c.relowner = r.oid
         ) then 'owns a table of core or gestion' end
       ], null) as problems
       from pg_roles r where r.rolname = current_user`,
    );
    const problems = r.rows[0]?.problems ?? ["is unknown"];
    if (problems.length > 0) {
      throw new Error(`The database login ${problems.join(", ")}: refusing to start (RLS would not apply).`);
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async run<T>(fn: (tx: Tx) => Promise<T>, identity: [string, string, string]): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.user_id', $1, true), set_config('app.company_id', $2, true), set_config('app.role', $3, true)",
        identity,
      );
      const result = await fn(drizzle({ client, schema }));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
