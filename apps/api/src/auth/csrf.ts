import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiError } from "../http/errors.ts";

export const CSRF_OPTIONS = Symbol("fastgo:csrf-options");
export type CsrfOptions = { cookieName: string; allowedOrigins: string[] };

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Same origin, no CORS (decision of #9). A write that carries the session cookie must come from an
 * allowed Origin and, when it has a body, be JSON (a form post from another site cannot be). A missing
 * Origin is refused; an empty list refuses everything. Runs before the API guard.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(CSRF_OPTIONS) private readonly options: CsrfOptions) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE.has(req.method)) return true;
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    if (cookies[this.options.cookieName] === undefined) return true;
    const origin = req.headers.origin;
    if (!origin || !this.options.allowedOrigins.includes(origin)) throw new ApiError("ACCESS_DENIED");
    const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
    if (hasBody && !/^application\/json(\s*;|$)/i.test(String(req.headers["content-type"] ?? ""))) {
      throw new ApiError("ACCESS_DENIED");
    }
    return true;
  }
}
