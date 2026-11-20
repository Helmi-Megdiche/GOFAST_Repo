import { Inject, Injectable, type OnModuleInit, RequestMethod, type Type } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer } from "@nestjs/core";
import { OPERATION } from "./operation.ts";
import { type Operation as Op, OPERATIONS } from "./tokens.ts";

type Route = { controller: string; handler: string; method: string; path: string; id?: string };

const norm = (...parts: string[]) =>
  "/" +
  parts
    .flatMap((p) => p.split("/"))
    .filter(Boolean)
    .join("/");
const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""));

/** Every route Nest will serve, read from the decorators of the controllers. */
export function routesOf(controllers: object[]): Route[] {
  const out: Route[] = [];
  for (const c of controllers) {
    const controller = c as Type<unknown>;
    const base = first(Reflect.getMetadata(PATH_METADATA, controller));
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const fn = controller.prototype[name] as unknown;
      if (typeof fn !== "function") continue;
      const verb = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined;
      if (verb === undefined) continue;
      out.push({
        controller: controller.name,
        handler: name,
        method: RequestMethod[verb] ?? String(verb),
        path: norm(base, first(Reflect.getMetadata(PATH_METADATA, fn))).replace(
          /:([A-Za-z_][A-Za-z0-9_]*)/g,
          "{$1}",
        ),
        id: Reflect.getMetadata(OPERATION, fn) as string | undefined,
      });
    }
  }
  return out;
}

/**
 * Boot check. The contract is the only list of routes, so: every Nest route has an `@Operation`,
 * the id exists, its method and path are the contract's, and an id is bound once. A public
 * operation cannot be `x-replay: key` (the replay scope needs an account). Throws all problems at once.
 */
export function auditRoutes(routes: Route[], operations: Map<string, Op>): void {
  const problems: string[] = [];
  const bound = new Map<string, string>();
  for (const r of routes) {
    const where = `${r.controller}.${r.handler} (${r.method} ${r.path})`;
    if (!r.id) {
      problems.push(`${where} has no @Operation`);
      continue;
    }
    const op = operations.get(r.id);
    if (!op) {
      problems.push(`${where}: @Operation("${r.id}") is not in the contract`);
      continue;
    }
    if (op.method !== r.method || op.path !== r.path)
      problems.push(`${where}: the contract says ${op.method} ${op.path} for "${r.id}"`);
    const other = bound.get(r.id);
    if (other) problems.push(`${where}: "${r.id}" is already bound to ${other}`);
    bound.set(r.id, where);
  }
  for (const op of operations.values()) {
    if (op.roles.includes("public") && op.replay === "key")
      problems.push(`${op.operationId} is public with x-replay: key (the scope needs an account)`);
  }
  if (problems.length > 0)
    throw new Error(`Routes do not match the contract:\n- ${problems.join("\n- ")}`);
}

@Injectable()
export class RouteAudit implements OnModuleInit {
  constructor(
    @Inject(ModulesContainer) private readonly modules: ModulesContainer,
    @Inject(OPERATIONS) private readonly operations: Map<string, Op>,
  ) {}

  onModuleInit(): void {
    const controllers = [...this.modules.values()].flatMap((m) =>
      [...m.controllers.values()].flatMap((w) => (w.metatype ? [w.metatype] : [])),
    );
    auditRoutes(routesOf(controllers), this.operations);
  }
}
