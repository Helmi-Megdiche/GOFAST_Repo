import type { components } from "@fastgo/contract";

export type ErrorCode = components["schemas"]["ErrorCode"];
export type FieldError = components["schemas"]["FieldError"];

export const STATUS_OF: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  ACCESS_DENIED: 403,
  SAME_ACTOR: 403,
  NOT_FOUND: 404,
  STATE_CONFLICT: 409,
  KEY_REUSED: 409,
  QUOTE_EXPIRED: 410,
  RULE_REFUSED: 422,
  TOO_MANY_ATTEMPTS: 429,
  PROVIDER_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** Thrown by handlers and guards; the filter turns it into the contract's error body. */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly fields: FieldError[] = [],
    readonly retryAfterSeconds?: number,
    /** Integers the client may show (`attempts_left`). */
    readonly details?: Record<string, number>,
  ) {
    super(code);
    this.status = STATUS_OF[code];
  }
}
