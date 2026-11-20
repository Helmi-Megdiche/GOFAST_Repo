import { Logger } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Actor } from "../http/session.ts";
import * as schema from "./schema/core.ts";

/** What a query function receives: a typed handle that lives for one transaction. */
export type Tx = NodePgDatabase<typeof schema>;

/** What is logged when a connection of the pool fails. Never the connection string. */
export type PoolErrorEntry = { event: "db_pool_error"; code?: string; severity?: string; message: string };
/** What is logged when close() gives up: how many clients had still not ended. */
export type CloseTimeoutEntry = { event: "db_close_timeout"; open: number };
export type DbLogEntry = PoolErrorEntry | CloseTimeoutEntry;

const logger = new Logger("db");
const logEntry = (entry: DbLogEntry) => logger.error(JSON.stringify(entry));

/**
 * THE ONE DOOR to the database. Nothing outside `src/db` may import `pg` (lint), and this module
 * never exports the pool. Every query runs inside a transaction that first sets the identity with
 * one bound `select set_config(name, value, true)`: the cahier's SET LOCAL, safe under PgBouncer
 * in transaction mode because the setting dies with the transaction. A test refuses
 * `set_config(..., false)`, a bare SET, advisory locks and named prepared statements in the code.
 */
export class Db {
  private readonly pool: pg.Pool;
  /** Every client that has connected and not yet emitted `end`: close() waits for them, at most `closeTimeoutMs`. */
  private readonly open = new Map<pg.PoolClient, Promise<void>>();
  private readonly onEntry: (entry: DbLogEntry) => void;
  private readonly closeTimeoutMs: number;

  /**
   * `onPoolError` receives the failures of idle connections and of checked-out ones (a database
   * restart, a failover, PgBouncer closing a server connection). Without a listener, Node would treat such an
   * error as an uncaught exception and the api, ws or worker process would exit. The pool drops the
   * failed client by itself; the next query opens a new one. The same callback receives the entry of
   * a close() that gave up. `closeTimeoutMs` (default 5 s: Docker's stop grace is 10 s, so a longer
   * wait would end in a SIGKILL anyway) is how long close() waits for the clients to end.
   */
  constructor(
    url: string,
    max = 10,
    onPoolError: (entry: DbLogEntry) => void = logEntry,
    closeTimeoutMs = 5_000,
  ) {
    this.onEntry = onPoolError;
    this.closeTimeoutMs = closeTimeoutMs;
    this.pool = new pg.Pool({ connectionString: url, max });
    // The pool and the client both emit the error of an idle client: log it once.
    const reported = new WeakSet<Error>();
    const report = (error: Error & { code?: string; severity?: string }) => {
      if (reported.has(error)) return;
      reported.add(error);
      // The message of a server error names no connection string; the code and severity say what it was.
      onPoolError({ event: "db_pool_error", code: error.code, severity: error.severity, message: error.message });
    };
    // An idle client that fails: the pool emits it here and removes the client.
    this.pool.on("error", report);
    this.pool.on("connect", (client) => {
      // A client that is checked out, or that is ending, has no listener of the pool: give it one,
      // or its error (57P01 when the server stops, a reset socket) kills the process.
      client.on("error", report);
      this.open.set(
        client,
        new Promise<void>((resolve) =>
          client.once("end", () => {
            this.open.delete(client);
            resolve();
          }),
        ),
      );
    });
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
         ) then 'owns a table of core or gestion' end,
         case when r.rolcreaterole then 'has CREATEROLE' end,
         -- Membership of these two would let the login SET ROLE to the owner of the tables or of the
         -- definer functions (and read what RLS hides): no application login may be a member.
         case when exists (
           select 1 from pg_auth_members m join pg_roles g on g.oid = m.roleid
            where m.member = r.oid and g.rolname in ('fastgo_migrator', 'fastgo_public_reader')
         ) then 'is a member of fastgo_migrator or fastgo_public_reader' end
       ], null) as problems
       from pg_roles r where r.rolname = current_user`,
    );
    const problems = r.rows[0]?.problems ?? ["is unknown"];
    if (problems.length > 0) {
      throw new Error(`The database login ${problems.join(", ")}: refusing to start (RLS would not apply).`);
    }
  }

  /**
   * Resolves when every client has emitted `end`, not only when the pool has asked them to end, but
   * for at most `closeTimeoutMs`: a client that never ends must not hang a shutdown. On timeout it
   * logs one `db_close_timeout` entry (how many clients were still open) and resolves.
   */
  async close(): Promise<void> {
    const ending = [...this.open.values()];
    const ended = Promise.all([this.pool.end(), ...ending]).then(() => "ended" as const);
    ended.catch(() => undefined); // if the timeout wins, a later failure must not become unhandled
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.closeTimeoutMs);
      timer.unref();
    });
    try {
      if ((await Promise.race([ended, timedOut])) === "timeout") {
        this.onEntry({ event: "db_close_timeout", open: this.open.size });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async run<T>(fn: (tx: Tx) => Promise<T>, identity: [string, string, string]): Promise<T> {
    const client = await this.pool.connect();
    let failure: unknown;
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
      failure = error;
      throw error;
    } finally {
      // After a failure the connection is dropped, not reused: its state is not trusted.
      client.release(failure === undefined ? undefined : (failure as Error));
    }
  }
}
