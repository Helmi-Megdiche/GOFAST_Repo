import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { generateTypes, GENERATED_FILE } from "./generate-types.ts";

/**
 * Checks on the bundled spec (`pnpm bundle` runs first). The YAML is the reference; these tests
 * fail when it breaks a rule of the cahier extract (docs/spec/technique-api.md) or of CLAUDE.md.
 */

type Json = Record<string, unknown>;
const read = (url: URL) => readFileSync(fileURLToPath(url), "utf8").replace(/\r\n/g, "\n");
const spec = parse(read(new URL("../dist/openapi.bundled.yaml", import.meta.url))) as Json;
const technique = read(new URL("../../../docs/spec/technique-api.md", import.meta.url));

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const ROLES = [
  "public",
  "individual",
  "merchant",
  "agent",
  "operations",
  "logistics",
  "customer_service",
  "accountant",
  "management",
  "admin",
  "driver",
  "cashier",
];

type Operation = {
  method: string;
  path: string;
  id: string;
  op: Json;
};

const components = spec.components as Json;
const operations: Operation[] = Object.entries(spec.paths as Record<string, Json>).flatMap(
  ([path, item]) =>
    METHODS.filter((method) => item[method]).map((method) => {
      const op = item[method] as Json;
      return { method: method.toUpperCase(), path, id: String(op.operationId), op };
    }),
);

const refName = (ref: string) => ref.split("/").pop() as string;
const parametersOf = (op: Json): Json[] =>
  ((op.parameters as Json[] | undefined) ?? []).map((p) =>
    p.$ref
      ? ((components.parameters as Record<string, Json>)[refName(p.$ref as string)] as Json)
      : p,
  );

/** The routes of the cahier's table, as "METHOD /v1/path" with every `{x}` written `{}`. */
function cahierRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const line of technique.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const route = cells[1];
    if (!route?.startsWith("/v1/") || cells.length < 6) continue;
    const base = route.replace(/ \(L\d\)$/, "").replace(/\{[^}]*\}/g, "{}");
    for (const action of (cells[2] ?? "").split(",").map((a) => a.trim())) {
      const [method, suffix = ""] = action.split(" ");
      routes.add(`${method} ${base}${suffix.replace(/\{[^}]*\}/g, "{}")}`);
    }
  }
  return routes;
}

const normalizePath = (path: string) => path.replace(/\{[^}]*\}/g, "{}");

describe("operations", () => {
  it("lists the routes of the first version", () => {
    expect(operations.length).toBeGreaterThanOrEqual(20);
    expect(new Set(operations.map((o) => o.id)).size).toBe(operations.length);
  });

  it.each(operations.map((o) => [`${o.method} ${o.path}`, o] as const))(
    "%s declares roles, replay and origin",
    (_name, { op, id }) => {
      expect(id).toMatch(/^[a-z][A-Za-z0-9]+$/);
      const roles = op["x-roles"] as string[];
      expect(roles.length).toBeGreaterThan(0);
      for (const role of roles) expect(ROLES).toContain(role);
      expect(["key", "state", "event", "none"]).toContain(op["x-replay"]);
      expect(["cahier", "addition"]).toContain(op["x-cahier"]);
    },
  );

  it.each(operations.map((o) => [`${o.method} ${o.path}`, o] as const))(
    "%s: a public route has no security, any other route keeps the cookie",
    (_name, { op }) => {
      const roles = op["x-roles"] as string[];
      if (roles.includes("public")) {
        expect(roles).toEqual(["public"]);
        expect(op.security).toEqual([]);
      } else {
        expect(op.security).toBeUndefined();
      }
    },
  );

  it.each(operations.map((o) => [`${o.method} ${o.path}`, o] as const))(
    "%s lists its errors with the shared body",
    (_name, { op }) => {
      const responses = op.responses as Record<string, Json>;
      expect(responses["500"]).toBeDefined();
      const hasInput =
        op.requestBody !== undefined ||
        parametersOf(op).some((p) => p.in === "path" || p.in === "query");
      if (hasInput) expect(responses["400"]).toBeDefined();
      for (const [status, raw] of Object.entries(responses)) {
        if (Number(status) < 400) continue;
        const response = raw.$ref
          ? ((components.responses as Record<string, Json>)[refName(raw.$ref as string)] as Json)
          : raw;
        const content = (response.content as Json)["application/json"] as Json;
        expect((content.schema as Json).$ref).toBe("#/components/schemas/ErrorBody");
        // "401 AUTH_REQUIRED. ..." : the description starts with the status it is used for.
        expect(String(response.description)).toMatch(new RegExp(`^${status} [A-Z_]+\\.`));
      }
    },
  );

  it("takes the Idempotency-Key on the routes marked key, and only there", () => {
    for (const { method, path, op } of operations) {
      const names = parametersOf(op).map((p) => p.name);
      if (op["x-replay"] === "key") {
        expect(method, path).toBe("POST");
        expect(names, path).toContain("Idempotency-Key");
        expect(Object.keys(op.responses as Json), path).toContain("409");
      } else {
        expect(names, path).not.toContain("Idempotency-Key");
      }
    }
  });
});

describe("the cahier", () => {
  const routes = cahierRoutes();

  it("reads its route table", () => {
    expect(routes.has("POST /v1/sessions")).toBe(true);
    expect(routes.has("POST /v1/orders/{}/cancel")).toBe(true);
    expect(routes.has("POST /v1/phone-checks/verify")).toBe(true);
  });

  it("marks a route `cahier` only when it is in the table, and `addition` only when it is not", () => {
    for (const { method, path, op } of operations) {
      const inTable = routes.has(`${method} ${normalizePath(path)}`);
      expect(op["x-cahier"], `${method} ${path}`).toBe(inTable ? "cahier" : "addition");
    }
  });

  it("uses the error codes of its table, plus INTERNAL_ERROR", () => {
    const codes = [...technique.matchAll(/^\| \d{3} \| ([A-Z_]+) \|/gm)].map((m) => m[1]);
    expect(codes).toHaveLength(11);
    const enumValues = (components.schemas as Record<string, Json>).ErrorCode?.enum;
    expect(enumValues).toEqual([...codes, "INTERNAL_ERROR"]);
  });
});

describe("conventions", () => {
  const schemas = components.schemas as Record<string, Json>;

  it("writes every property in snake_case", () => {
    const bad: string[] = [];
    const walk = (node: unknown, where: string): void => {
      if (Array.isArray(node)) node.forEach((item, i) => walk(item, `${where}[${i}]`));
      else if (node && typeof node === "object") {
        const object = node as Json;
        if (object.properties && typeof object.properties === "object") {
          for (const key of Object.keys(object.properties as Json))
            if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(key)) bad.push(`${where}.${key}`);
        }
        for (const [key, value] of Object.entries(object)) walk(value, `${where}.${key}`);
      }
    };
    walk(schemas, "schemas");
    expect(bad).toEqual([]);
  });

  it("types every amount as Money (integer millimes)", () => {
    expect(schemas.Money).toMatchObject({ type: "integer", minimum: 0 });
    const bad: string[] = [];
    const isMoney = (schema: Json): boolean =>
      schema.$ref === "#/components/schemas/Money" ||
      (Array.isArray(schema.oneOf) &&
        (schema.oneOf as Json[]).some((s) => s.$ref === "#/components/schemas/Money"));
    const walk = (node: unknown, where: string): void => {
      if (Array.isArray(node)) node.forEach((item, i) => walk(item, `${where}[${i}]`));
      else if (node && typeof node === "object") {
        const object = node as Json;
        for (const [key, value] of Object.entries((object.properties ?? {}) as Json))
          if (/millimes$/.test(key) && !isMoney(value as Json)) bad.push(`${where}.${key}`);
        for (const [key, value] of Object.entries(object)) walk(value, `${where}.${key}`);
      }
    };
    walk(schemas, "schemas");
    expect(bad).toEqual([]);
  });

  it("never sends a float for money: no `number` type next to an amount", () => {
    const text = JSON.stringify(schemas);
    expect(text).not.toMatch(/millimes"?:\{[^}]*"type":"number"/);
  });
});

describe("generated types", () => {
  it("are up to date: run `pnpm --filter @fastgo/contract generate` after changing the YAML", async () => {
    const committed = read(GENERATED_FILE);
    const fresh = (await generateTypes()).replace(/\r\n/g, "\n");
    expect(committed).toBe(fresh);
  });
});
