import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

export type Role =
  | "public"
  | "individual"
  | "merchant"
  | "agent"
  | "operations"
  | "logistics"
  | "customer_service"
  | "accountant"
  | "management"
  | "admin"
  | "driver"
  | "cashier";

export type Operation = {
  operationId: string;
  method: string;
  /** OpenAPI path, e.g. `/v1/orders/{id}`. */
  path: string;
  roles: Role[];
  replay: "key" | "state" | "event" | "none";
  body: ValidateFunction | null;
  bodyRequired: boolean;
  /** Parameters (path, query, header), each with its own validator. */
  params: {
    name: string;
    in: "path" | "query" | "header";
    required: boolean;
    validate: ValidateFunction;
  }[];
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const METHODS = ["get", "post", "put", "patch", "delete"];

/** Path of the bundled spec, built by `pnpm --filter @fastgo/contract bundle` (turbo task `bundle`). */
export function bundledSpecPath(): string {
  return createRequire(import.meta.url).resolve("@fastgo/contract/openapi.bundled.yaml");
}

/**
 * Reads the bundled contract and compiles one validator per body and per parameter. Ajv 2020 is
 * needed for `unevaluatedProperties`, which the contract uses to pin each error code to its status.
 */
export function loadOperations(path = bundledSpecPath()): Map<string, Operation> {
  const spec = parse(readFileSync(path, "utf8")) as Json;
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateSchema: false,
    coerceTypes: false,
  });
  addFormats.default(ajv);
  ajv.addFormat("password", true);
  ajv.addSchema({ ...spec, $id: "spec" });
  // Query and path values arrive as strings: parameters are checked with coercion, bodies are not. "array": a repeatable
  // parameter (`?status=a&status=b`) arrives as a string when it is given once, and that is a list of one (GH-22).
  const paramAjv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateSchema: false,
    coerceTypes: "array",
  });
  addFormats.default(paramAjv);
  const deref = (p: Json): Json =>
    typeof p.$ref === "string"
      ? (p.$ref
          .split("/")
          .slice(1)
          .reduce((n: Json, k: string) => n[k], spec) as Json)
      : p;
  const ptr = (...parts: string[]) =>
    "spec#/" + parts.map((p) => p.replaceAll("~", "~0").replaceAll("/", "~1")).join("/");
  const ops = new Map<string, Operation>();
  for (const [path, item] of Object.entries<Json>(spec.paths)) {
    for (const method of METHODS) {
      const op = item[method] as Json | undefined;
      if (!op) continue;
      const json = op.requestBody?.content?.["application/json"]?.schema;
      const params = ((op.parameters ?? []) as Json[]).map(deref).map((p) => ({
        name: p.name as string,
        in: p.in as "path" | "query" | "header",
        required: p.required === true,
        validate: paramAjv.compile({
          type: "object",
          properties: { v: p.schema ?? {} },
          components: spec.components,
        }),
      }));
      ops.set(op.operationId, {
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        roles: op["x-roles"],
        replay: op["x-replay"],
        body: json
          ? ajv.compile({
              $ref: ptr(
                "paths",
                path,
                method,
                "requestBody",
                "content",
                "application/json",
                "schema",
              ),
            })
          : null,
        bodyRequired: op.requestBody?.required === true,
        params,
      });
    }
  }
  return ops;
}
