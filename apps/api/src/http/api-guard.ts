import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { ApiError, type FieldError } from "./errors.ts";
import { OPERATION } from "./operation.ts";
import { SessionResolver, type Actor } from "./session.ts";
import { type Operation as Op, OPERATIONS } from "./tokens.ts";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Actor | null;
    operation?: Op;
  }
}

type AjvError = { instancePath: string; keyword: string; params: Record<string, unknown> };

/** `/sender/phone` becomes `sender.phone`; a missing property is named by its own path. */
export function toFields(errors: AjvError[], prefix = ""): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const e of errors) {
    let path = e.instancePath.split("/").filter(Boolean).join(".");
    if (e.keyword === "required")
      path = [path, String(e.params.missingProperty)].filter(Boolean).join(".");
    if (e.keyword === "additionalProperties" || e.keyword === "unevaluatedProperties") {
      path = [path, String(e.params.additionalProperty ?? e.params.unevaluatedProperty)]
        .filter(Boolean)
        .join(".");
    }
    const name = [prefix, path].filter(Boolean).join(".") || "body";
    const reason = e.keyword === "required" ? "required" : e.keyword;
    const key = `${name}:${reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ name, reason });
    }
  }
  return out;
}

/**
 * The first three checks of every route, in the contract's order: authentication (401), roles
 * (403), validation (400). The handler runs after.
 */
@Injectable()
export class ApiGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(OPERATIONS) private readonly operations: Map<string, Op>,
    @Inject(SessionResolver) private readonly sessions: SessionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const id = this.reflector.get<string | undefined>(OPERATION, context.getHandler());
    if (!id) return true;
    const op = this.operations.get(id);
    if (!op) throw new Error(`@Operation("${id}") is not in the contract`);
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    req.operation = op;

    if (!op.roles.includes("public")) {
      req.actor = await this.sessions.resolve(
        (req.cookies ?? {}) as Record<string, string | undefined>,
      );
      if (!req.actor) throw new ApiError("AUTH_REQUIRED");
      if (!op.roles.includes(req.actor.role)) throw new ApiError("ACCESS_DENIED");
    }

    const fields: FieldError[] = [];
    for (const p of op.params) {
      const source = (
        p.in === "path" ? req.params : p.in === "query" ? req.query : req.headers
      ) as Record<string, unknown>;
      const value = source?.[p.in === "header" ? p.name.toLowerCase() : p.name];
      if (value === undefined) {
        if (p.required) fields.push({ name: p.name, reason: "required" });
        continue;
      }
      const holder = { v: value };
      if (!p.validate(holder))
        fields.push(
          ...toFields(p.validate.errors as AjvError[], p.name).map((f) => ({ ...f, name: p.name })),
        );
    }
    if (op.body) {
      if (req.body === undefined || req.body === null) {
        if (op.bodyRequired) fields.push({ name: "body", reason: "required" });
      } else if (!op.body(req.body)) {
        fields.push(...toFields(op.body.errors as AjvError[]));
      }
    }
    if (fields.length > 0) throw new ApiError("VALIDATION_FAILED", fields);
    return true;
  }
}
