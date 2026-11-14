import { createHash } from "node:crypto";
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

type Entry = {
  fingerprint: string;
  expiresAt: number;
  /** Settles when the first call ends; true when it stored an answer. */
  settled: Promise<boolean>;
  answer?: { status: number; body: unknown };
};

/**
 * Keeps the first answer of a keyed request for 24 h (R202). In memory in this skeleton; PR 3/4
 * moves it to the database (unique per account, route and key) behind the same methods.
 */
export abstract class IdempotencyStore {
  abstract get(scope: string): Entry | undefined;
  abstract set(scope: string, entry: Entry): void;
  abstract delete(scope: string): void;
  /** RV-18: the stored answers of a closed account are erased. */
  abstract purgeAccount(accountId: string): void;
}

export class MemoryIdempotencyStore extends IdempotencyStore {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly now: () => number = Date.now) {
    super();
  }
  override get(scope: string) {
    const e = this.entries.get(scope);
    if (e && e.expiresAt <= this.now()) {
      this.entries.delete(scope);
      return undefined;
    }
    return e;
  }
  override set(scope: string, entry: Entry) {
    this.entries.set(scope, entry);
  }
  override delete(scope: string) {
    this.entries.delete(scope);
  }
  override purgeAccount(accountId: string) {
    for (const k of this.entries.keys()) if (k.startsWith(`${accountId}|`)) this.entries.delete(k);
  }
}

export const fingerprint = (method: string, url: string, body: unknown): string =>
  createHash("sha256")
    .update(`${method}\n${url}\n${JSON.stringify(body ?? null)}`)
    .digest("hex");

/**
 * Same key and same content: the first answer again, nothing done twice. Same key and other
 * content: 409 KEY_REUSED. A second call while the first runs waits and gets the same answer.
 * Only a successful answer is kept; a failed attempt can be tried again with the same key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IdempotencyStore) private readonly store: IdempotencyStore,
    private readonly now: () => number = Date.now,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const op = req.operation;
    const key = req.headers["idempotency-key"];
    if (op?.replay !== "key" || typeof key !== "string") return next.handle();

    const scope = `${req.actor?.accountId ?? "anonymous"}|${op.method} ${op.path}|${key}`;
    const fp = fingerprint(req.method, req.url, req.body);

    return defer(async () => {
      for (;;) {
        const entry = this.store.get(scope);
        if (!entry) {
          let settle!: (stored: boolean) => void;
          const mine: Entry = {
            fingerprint: fp,
            expiresAt: this.now() + PROVISIONAL.idempotencyHours * 3_600_000,
            settled: new Promise<boolean>((resolve) => (settle = resolve)),
          };
          this.store.set(scope, mine);
          try {
            const body = await lastValueFrom(next.handle(), { defaultValue: undefined });
            mine.answer = { status: reply.statusCode, body };
            settle(true);
            return body;
          } catch (error) {
            this.store.delete(scope);
            settle(false);
            throw error;
          }
        }
        if (entry.fingerprint !== fp) throw new ApiError("KEY_REUSED");
        if (!entry.answer) {
          await entry.settled;
          continue;
        }
        void reply.status(entry.answer.status);
        return entry.answer.body;
      }
    });
  }
}
