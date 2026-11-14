import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError, type ErrorCode, type FieldError } from "./errors.ts";
import { errorMessage } from "./messages.ts";

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

    if (error instanceof ApiError) {
      ({ code, status, fields } = error);
      retryAfter = error.retryAfterSeconds;
    } else if (error instanceof HttpException && error.getStatus() === 404) {
      code = "NOT_FOUND";
      status = 404;
    } else if (
      typeof (error as { statusCode?: unknown })?.statusCode === "number" &&
      (error as { statusCode: number }).statusCode < 500
    ) {
      // Fastify's own refusals: broken JSON, wrong content type, body too large.
      code = "VALIDATION_FAILED";
      status = 400;
      fields = [{ name: "body", reason: "invalidBody" }];
    } else if (error instanceof HttpException && error.getStatus() < 500) {
      code = "VALIDATION_FAILED";
      status = 400;
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
        trace_id: String(req.id),
      },
    });
  }
}
