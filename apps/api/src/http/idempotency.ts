import { createHash, randomUUID } from "node:crypto";
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type Observable, defer, lastValueFrom } from "rxjs";
import { PROVISIONAL } from "../provisional.ts";
import { ApiError } from "./errors.ts";

export type Answer = { status: number; body: unknown };

/** What `begin` found for a scope (account, route, key). */
export type Begin =
  | { kind: "new"; token: string } // the caller holds the lease now and must call `complete` or `abort` with this token
  | { kind: "replay"; answer: Answer } // same content, finished: answer again
  | { kind: "conflict" } // same key, other content
  | { kind: "running" }; // same content, the first call has not ended: wait and ask again

/**
 * Keeps the first answer of a keyed request for 24 h (R202). `begin` is atomic: of two callers with
 * the same scope exactly one gets `new`. Every method is async so that the database store of PR 3
 * (unique index on account, route and key; `INSERT ... ON CONFLICT`) implements the same contract
 * and several instances of the API share it. A `running` row older than the lock time counts as
 * abandoned (a crashed process) and is handed to the next caller as `new` with a new token; `complete`
 * and `abort` act only when the token is still the row's, so a slow first call cannot overwrite or
 * delete the answer of the call that took over. The lock time must exceed the longest handler.
 */
export abstract class IdempotencyStore {
  abstract begin(scope: string, fingerprint: string): Promise<Begin>;
  /** Stores the answer of the call that got `new`. */
  abstract complete(scope: string, token: string, answer: Answer): Promise<void>;
  /** The call failed: forget the key so the same key can be tried again. */
  abstract abort(scope: string, token: string): Promise<void>;
  /** RV-18: the stored answers of a closed account are erased. Returns how many. */
  abstract purgeAccount(accountId: string): Promise<number>;
  /** Removes what is past 24 h (a job of the `worker`). Returns how many. */
  abstract purgeExpired(): Promise<number>;
}

type Entry = {
  fingerprint: string;
  expiresAt: number;
  lockedUntil: number;
  token: string;
  answer?: Answer;
};

/**
 * ONE PROCESS ONLY: two instances of the API would not see each other's keys. It is for the tests
 * and for the skeleton; production binds the database store (PR 3).
 */
export class MemoryIdempotencyStore extends IdempotencyStore {
  private readonly entries = new Map<string, Entry>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly lockMs = 300_000,
  ) {
    super();
  }

  override async begin(scope: string, fingerprint: string): Promise<Begin> {
    const now = this.now();
    const e = this.entries.get(scope);
    if (e && e.expiresAt > now) {
      if (e.fingerprint !== fingerprint) return { kind: "conflict" };
      if (e.answer) return { kind: "replay", answer: e.answer };
      if (e.lockedUntil > now) return { kind: "running" };
    }
    const token = randomUUID();
    this.entries.set(scope, {
      token,
      fingerprint,
      expiresAt: now + PROVISIONAL.idempotencyHours * 3_600_000,
      lockedUntil: now + this.lockMs,
    });
    return { kind: "new", token };
  }
  override async complete(scope: string, token: string, answer: Answer) {
    const e = this.entries.get(scope);
    if (e?.token === token) e.answer = answer;
  }
  override async abort(scope: string, token: string) {
    if (this.entries.get(scope)?.token === token) this.entries.delete(scope);
  }
  override async purgeAccount(accountId: string) {
    let n = 0;
    for (const k of [...this.entries.keys()]) {
      if (k.startsWith(`${accountId}|`)) {
        this.entries.delete(k);
        n += 1;
      }
    }
    return n;
  }
  override async purgeExpired() {
    const now = this.now();
    let n = 0;
    for (const [k, e] of [...this.entries]) {
      if (e.expiresAt <= now) {
        this.entries.delete(k);
        n += 1;
      }
    }
    return n;
  }
}

/** JSON with object keys sorted at every depth: key order in the body does not change the print. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value ?? null, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );

/** Same call = same route template, same path and query values (any order), same body (any key order). */
export const fingerprint = (
  route: string,
  params: unknown,
  query: unknown,
  body: unknown,
): string =>
  createHash("sha256")
    .update(canonical([route, params, query, body]))
    .digest("hex");

const POLL_MS = 25;
const MAX_WAIT_MS = 30_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Same key and same content: the first answer again, nothing done twice. Same key and other
 * content: 409 KEY_REUSED. A second call while the first runs waits and gets the same answer. Only a
 * successful answer is kept; a failed attempt can be tried again with the same key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IdempotencyStore) private readonly store: IdempotencyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const op = req.operation;
    const key = req.headers["idempotency-key"];
    if (op?.replay !== "key" || typeof key !== "string") return next.handle();

    const scope = `${req.actor?.accountId ?? "anonymous"}|${op.method} ${op.path}|${key}`;
    const fp = fingerprint(`${op.method} ${op.path}`, req.params, req.query, req.body);

    return defer(async () => {
      const giveUpAt = Date.now() + MAX_WAIT_MS;
      for (;;) {
        const found = await this.store.begin(scope, fp);
        if (found.kind === "conflict") throw new ApiError("KEY_REUSED");
        if (found.kind === "replay") {
          void reply.status(found.answer.status);
          return found.answer.body;
        }
        if (found.kind === "running") {
          if (Date.now() > giveUpAt) throw new ApiError("STATE_CONFLICT");
          await sleep(POLL_MS);
          continue;
        }
        try {
          const body = await lastValueFrom(next.handle(), { defaultValue: undefined });
          await this.store.complete(scope, found.token, { status: reply.statusCode, body });
          return body;
        } catch (error) {
          await this.store.abort(scope, found.token);
          throw error;
        }
      }
    });
  }
}
