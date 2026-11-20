import type { ErrorBody } from "@fastgo/contract";

/** Thrown when the request or its answer was lost (cut, timeout): the order may exist. */
export class NetworkError extends Error {
  constructor() {
    super("network");
    this.name = "NetworkError";
  }
}

/** 401: the session is gone. The caller redirects to sign-in (see unauthorized.ts). */
export class AuthRequiredError extends Error {
  constructor() {
    super("auth");
    this.name = "AuthRequiredError";
  }
}

/**
 * Any answer the UI has no message for. Carries the trace id for the error screen or the log, never
 * the server text.
 */
export class ServerError extends Error {
  constructor(
    readonly traceId: string | null,
    readonly reason: "server" | "tooManyAttempts" = "server",
  ) {
    super(reason);
    this.name = "ServerError";
  }
}

export type OrderFailure =
  | {
      kind: "refused";
      error:
        | "idempotencyConflict"
        | "quoteExpired"
        | "outOfZone"
        | "phoneNotVerified"
        | "quoteNotAccepted";
    }
  | { kind: "signIn" }
  | { kind: "tooManyAttempts" }
  | { kind: "server"; traceId: string | null };

export function asErrorBody(value: unknown): ErrorBody | null {
  if (typeof value !== "object" || value === null) return null;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  return typeof (error as { code?: unknown }).code === "string" ? (value as ErrorBody) : null;
}

/** The trace id of an error answer, for the error screen or the log. Never the server text. */
export function traceIdOf(value: unknown): string | null {
  return asErrorBody(value)?.error.trace_id ?? null;
}

const RULE_REASONS: Record<string, Extract<OrderFailure, { kind: "refused" }>["error"]> = {
  outOfZone: "outOfZone",
  phoneRequired: "phoneNotVerified",
  quoteChanged: "quoteNotAccepted",
};

/** ErrorBody of POST /v1/orders to the UI errors that already exist. Server text is never shown. */
export function mapOrderFailure(status: number, value: unknown): OrderFailure {
  const body = asErrorBody(value);
  const traceId = traceIdOf(value);
  const code = body?.error.code;
  if (status === 401 || code === "AUTH_REQUIRED") return { kind: "signIn" };
  if (status === 429 || code === "TOO_MANY_ATTEMPTS") return { kind: "tooManyAttempts" };
  if (code === "KEY_REUSED") return { kind: "refused", error: "idempotencyConflict" };
  if (code === "QUOTE_EXPIRED") return { kind: "refused", error: "quoteExpired" };
  if (code === "RULE_REFUSED") {
    for (const field of body?.error.fields ?? []) {
      const mapped = RULE_REASONS[field.reason];
      if (mapped) return { kind: "refused", error: mapped };
    }
  }
  return { kind: "server", traceId };
}
