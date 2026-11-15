import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError, type ErrorCode, type FieldError, STATUS_OF } from "./errors.ts";
import { errorMessage } from "./messages.ts";

const CODE_OF_STATUS: Record<number, ErrorCode> = {
  401: "AUTH_REQUIRED",
  403: "ACCESS_DENIED",
  404: "NOT_FOUND",
  409: "STATE_CONFLICT",
  429: "TOO_MANY_ATTEMPTS",
};

/** The 4xx status of a framework error (Nest `HttpException` or Fastify `statusCode`), if it is one. */
function clientStatus(error: unknown): number | undefined {
  const status =
    error instanceof HttpException
      ? error.getStatus()
      : (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" && status >= 400 && status < 500 ? status : undefined;
}

/** One error body for every failure (`ErrorBody` of the contract). Unknown errors are logged, never shown. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger("ErrorFilter");

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    let code: ErrorCode = "INTERNAL_ERROR";
    let status = 500;
    let fields: FieldError[] = [];
    let retryAfter: number | undefined;
    let details: Record<string, number> | undefined;

    if (error instanceof ApiError) {
      ({ code, status, fields } = error);
      retryAfter = error.retryAfterSeconds;
      details = error.details;
    } else if (clientStatus(error) !== undefined) {
      // Nest and Fastify refusals: unknown route, broken JSON, wrong content type, body too large.
      status = clientStatus(error) as number;
      code = CODE_OF_STATUS[status] ?? "VALIDATION_FAILED";
      if (!(status in CODE_OF_STATUS)) {
        status = 400;
        fields = [{ name: "body", reason: "invalidBody" }];
      } else status = STATUS_OF[code];
    } else {
      this.log.error(
        `${req.method} ${req.url} ${req.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    if (retryAfter !== undefined) void reply.header("Retry-After", String(retryAfter));
    void reply.status(status).send({
      error: {
        code,
        message: errorMessage(code, req.headers["accept-language"]),
        fields,
        ...(details ? { details } : {}),
        trace_id: String(req.id),
      },
    });
  }
}
