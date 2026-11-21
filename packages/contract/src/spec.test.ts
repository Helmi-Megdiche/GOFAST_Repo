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

const schemas = components.schemas as Record<string, Json>;
const cahierErrors = new Set(
  [...technique.matchAll(/^\| (\d{3}) \| ([A-Z_]+) \|/gm)].map((m) => `${m[1]} ${m[2]}`),
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

const CAHIER_ROLES: Record<string, string[]> = {
  particulier: ["individual"],
  commerçant: ["merchant"],
  agent: ["agent"],
  opérations: ["operations"],
  logistique: ["logistics"],
  "service client": ["customer_service"],
  comptable: ["accountant"],
  direction: ["management"],
  admin: ["admin"],
  public: ["public"],
  "any account": ROLES.filter((r) => r !== "public"),
};
const CAHIER_REPLAY: Record<string, string> = {
  no: "none",
  key: "key",
  state: "state",
  event: "event",
};

type CahierRow = { roles: string[]; readRoles: string[]; replay: string };

/** The cahier's table as "METHOD /v1/path" (every `{x}` written `{}`) to its roles and replay. */
function cahierRows(): Map<string, CahierRow> {
  const rows = new Map<string, CahierRow>();
  const names = (text: string): string[] =>
    text
      .replace(/\(own\)/g, "")
      .replace(/^read /, "")
      .split(/,| and /)
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n && n !== "limited attempts")
      .flatMap((n) => CAHIER_ROLES[n] ?? (n.startsWith("public") ? ["public"] : [`?${n}`]));
  for (const line of technique.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const route = cells[1];
    if (!route?.startsWith("/v1/") || cells.length < 6) continue;
    const base = route.replace(/ \(L\d\)$/, "").replace(/\{[^}]*\}/g, "{}");
    const [main = "", ...rest] = (cells[3] ?? "").split(";");
    const row: CahierRow = {
      roles: names(main),
      readRoles: rest.flatMap((part) => names(part.trim())),
      replay: CAHIER_REPLAY[(cells[4] ?? "").toLowerCase()] ?? "?",
    };
    for (const action of (cells[2] ?? "").split(",").map((a) => a.trim())) {
      const [method, suffix = ""] = action.split(" ");
      rows.set(`${method} ${base}${suffix.replace(/\{[^}]*\}/g, "{}")}`, row);
    }
  }
  return rows;
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
        // "401 AUTH_REQUIRED. ..." : the description starts with the status it is used for.
        const [, described] =
          String(response.description).match(new RegExp(`^${status} ([A-Z_]+)\\.`)) ?? [];
        expect(described, `${status} description`).toBeDefined();
        // The body schema pins that same code, so a 404 cannot carry VALIDATION_FAILED.
        const body = schemas[refName((content.schema as Json).$ref as string)] ?? {};
        const error = (body.properties as Json).error as Json;
        const pinned = ((error.allOf as Json[])[1]?.properties as Json | undefined)?.code as
          Json | undefined;
        expect(pinned?.const, `${status} body code`).toBe(described);
        expect(error.unevaluatedProperties).toBe(false);
        // The pair is one of the cahier's table, or the accepted INTERNAL_ERROR.
        expect(
          cahierErrors.has(`${status} ${described}`) ||
            `${status} ${described}` === "500 INTERNAL_ERROR",
        ).toBe(true);
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

describe("GH-25 T60: staff sign-in with a second factor", () => {
  const staff = () => operations.find((o) => o.id === "createStaffSession");
  const props = (name: string) => (schemas[name]?.properties ?? {}) as Record<string, Json>;
  const required = (name: string) => (schemas[name]?.required ?? []) as string[];

  it("POST /v1/staff/sessions is a public addition with no replay, and answers Me", () => {
    const op = staff();
    expect(op?.method).toBe("POST");
    expect(op?.path).toBe("/v1/staff/sessions");
    expect(op?.op["x-roles"]).toEqual(["public"]);
    expect(op?.op["x-replay"]).toBe("none");
    expect(op?.op["x-cahier"]).toBe("addition");
    const responses = Object.keys(op?.op.responses as Json);
    expect(responses).toEqual(expect.arrayContaining(["201", "400", "401", "429"]));
  });

  it("takes an identifier, a password and a 6-digit code, and nothing else", () => {
    expect(required("StaffSignInRequest")).toEqual(["identifier", "password", "code"]);
    expect(props("StaffSignInRequest").code).toMatchObject({ type: "string", pattern: "^[0-9]{6}$" });
  });

  it("POST /v1/sessions says that staff accounts are refused there, and the staff route says a wrong code is the same 401", () => {
    const sessions = operations.find((o) => o.id === "createSession")?.op as Json;
    expect(String(sessions.description)).toMatch(/staff/i);
    expect(String(staff()?.op.description)).toMatch(/same 401/);
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

  // Where the contract differs from the cahier on purpose; each reason is in the operation's text.
  const DIFFERENT_ROLES: Record<string, string> = {
    "POST /v1/sessions": "the caller has no session; any account may sign in",
    "POST /v1/sessions/google":
      "the caller has no session; the handler allows customers and merchants",
    "POST /v1/orders": "creating an order for a customer (staff) is not in this version",
  };

  it("gives every `cahier` route the roles and the replay of its table row", () => {
    const rows = cahierRows();
    expect(rows.get("POST /v1/orders/{}/confirm")?.roles).toEqual(["agent", "operations", "admin"]);
    const checked: string[] = [];
    for (const { method, path, op } of operations) {
      if (op["x-cahier"] !== "cahier") continue;
      const key = `${method} ${normalizePath(path)}`;
      const row = rows.get(key);
      expect(row, key).toBeDefined();
      if (!row) continue;
      const allowed = method === "GET" ? [...row.roles, ...row.readRoles] : row.roles;
      expect(
        allowed.filter((r) => r.startsWith("?")),
        `${key} role names`,
      ).toEqual([]);
      const roles = op["x-roles"] as string[];
      if (DIFFERENT_ROLES[key]) {
        // Still never wider than the cahier, except the two sign-in routes, which are public.
        if (!key.startsWith("POST /v1/sessions"))
          for (const r of roles) expect(allowed, key).toContain(r);
      } else {
        expect([...roles].sort(), `${key} roles`).toEqual([...new Set(allowed)].sort());
      }
      expect(op["x-replay"], `${key} replay`).toBe(method === "GET" ? "none" : row.replay);
      checked.push(key);
    }
    expect(checked.length).toBeGreaterThanOrEqual(13);
  });

  it("uses the error codes of its table, plus INTERNAL_ERROR", () => {
    const codes = [...technique.matchAll(/^\| \d{3} \| ([A-Z_]+) \|/gm)].map((m) => m[1]);
    expect(codes).toHaveLength(11);
    const enumValues = schemas.ErrorCode?.enum;
    expect(enumValues).toEqual([...codes, "INTERNAL_ERROR"]);
  });
});

describe("conventions", () => {
  /** Every `properties` map in the whole spec: components and inline schemas of the paths alike. */
  const propertyMaps: { where: string; owner: Json; props: Json }[] = [];
  const collect = (node: unknown, where: string): void => {
    if (Array.isArray(node)) node.forEach((item, i) => collect(item, `${where}[${i}]`));
    else if (node && typeof node === "object") {
      const object = node as Json;
      if (object.properties && typeof object.properties === "object")
        propertyMaps.push({ where, owner: object, props: object.properties as Json });
      for (const [key, value] of Object.entries(object)) collect(value, `${where}.${key}`);
    }
  };
  collect(spec.paths, "paths");
  collect(spec.components, "components");

  it("walks the inline schemas of the paths too", () => {
    expect(propertyMaps.some((m) => m.where.startsWith("paths"))).toBe(true);
    expect(propertyMaps.some((m) => m.where.startsWith("components"))).toBe(true);
  });

  it("writes every property in snake_case", () => {
    const bad = propertyMaps.flatMap(({ where, props }) =>
      Object.keys(props)
        .filter((key) => !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(key))
        .map((key) => `${where}.${key}`),
    );
    expect(bad).toEqual([]);
  });

  it("types every amount as Money (integer millimes), but a discount line", () => {
    expect(schemas.Money).toMatchObject({ type: "integer", minimum: 0 });
    expect(schemas.DiscountMillimes).toMatchObject({ type: "integer", maximum: 0 });
    const ref = (name: string) => `#/components/schemas/${name}`;
    const isMoney = (schema: Json): boolean =>
      schema.$ref === ref("Money") ||
      (Array.isArray(schema.oneOf) &&
        (schema.oneOf as Json[]).some((s) => s.$ref === ref("Money")));
    const bad: string[] = [];
    let discountUses = 0;
    for (const { where, owner, props } of propertyMaps) {
      for (const [key, value] of Object.entries(props)) {
        if (!/millimes$/.test(key)) continue;
        const schema = value as Json;
        if (schema.$ref === ref("DiscountMillimes")) {
          // The only place a negative amount is allowed: a line whose kind is `discount`.
          discountUses += 1;
          if ((props.kind as Json | undefined)?.const !== "discount" || owner.type !== "object")
            bad.push(`${where}.${key} (negative outside a discount line)`);
        } else if (!isMoney(schema)) bad.push(`${where}.${key}`);
      }
    }
    expect(bad).toEqual([]);
    expect(discountUses).toBe(2);
  });

  it("never sends a float for money: no `number` type next to an amount", () => {
    for (const { where, props } of propertyMaps)
      for (const [key, value] of Object.entries(props))
        if (/millimes$/.test(key))
          expect(JSON.stringify(value), `${where}.${key}`).not.toContain('"number"');
  });
});

describe("generated types", () => {
  it("are up to date: run `pnpm --filter @fastgo/contract generate` after changing the YAML", async () => {
    const committed = read(GENERATED_FILE);
    const fresh = (await generateTypes()).replace(/\r\n/g, "\n");
    expect(committed).toBe(fresh);
  });
});

describe("GH-10 pricing contract (Plan PR 4b-1)", () => {
  const props = (name: string) => (schemas[name]?.properties ?? {}) as Record<string, Json>;
  const required = (name: string) => (schemas[name]?.required ?? []) as string[];
  const op = (id: string) => operations.find((o) => o.id === id);

  it("R201_T04: POST /v1/zone-checks is a public, limited addition", () => {
    const check = op("createZoneCheck");
    expect(check).toMatchObject({ method: "POST", path: "/v1/zone-checks" });
    expect(check?.op["x-roles"]).toEqual(["public"]);
    expect(check?.op["x-replay"]).toBe("none");
    expect(check?.op["x-cahier"]).toBe("addition");
    const responses = check?.op.responses as Record<string, Json>;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(["200", "400", "429", "500"]));
  });

  it("R201_T04: a zone check takes exactly one of pin or zone_id, and answers all fields", () => {
    const request = schemas.ZoneCheckRequest as Json;
    expect(request.oneOf).toHaveLength(2);
    const answer = schemas.ZoneCheck as Json;
    expect(answer.required).toEqual(
      expect.arrayContaining(["status", "zone_id", "zone_name", "services", "reason"]),
    );
    expect((props("ZoneCheck").status as Json).enum).toEqual(["in_zone", "out_of_zone"]);
    expect(JSON.stringify(props("ZoneCheck").reason)).toContain("outOfZone");
    expect(JSON.stringify(props("ZoneCheck").reason)).toContain('"null"');
  });

  it("the catalog lists the active zones and a packaging price per offer", () => {
    expect(props("ServiceCatalog").zones).toBeDefined();
    expect(JSON.stringify(props("ServiceCatalog").zones)).toContain("governorate");
    expect(required("ServiceCatalog")).toContain("zones");
    const offer = ((props("ServiceCatalog").offers as Json).items as Json) ?? {};
    expect(Object.keys(offer.properties as Json)).toContain("packaging_price_millimes");
    expect(offer.required).toContain("packaging_price_millimes");
  });

  it("an address may carry the picked zone_id", () => {
    expect(Object.keys(props("AddressInput"))).toContain("zone_id");
    expect(required("AddressInput")).not.toContain("zone_id");
  });

  it("R204: a quote names the zone of each address (offre et zone): departure and arrival, each zone_id and zone_name", () => {
    const quote = props("Quote");
    expect(Object.keys(quote)).toEqual(expect.arrayContaining(["departure", "arrival"]));
    expect(Object.keys(quote)).not.toContain("zone_id");
    expect(Object.keys(quote)).not.toContain("zone_name");
    expect(required("Quote")).toEqual(expect.arrayContaining(["departure", "arrival"]));
    for (const side of ["departure", "arrival"]) expect(quote[side]).toMatchObject({ $ref: "#/components/schemas/QuoteZone" });
    expect(required("QuoteZone")).toEqual(["zone_id", "zone_name"]);
    expect(props("QuoteZone").zone_id).toMatchObject({ $ref: "#/components/schemas/ResourceId" });
    expect(props("QuoteZone").zone_name).toMatchObject({ type: "string" });
  });

  it("the catalog zones carry the name in French, Arabic and English", () => {
    const zone = (((props("ServiceCatalog").zones as Json).items as Json) ?? {}) as Json;
    expect(zone.required).toEqual(expect.arrayContaining(["id", "name", "name_ar", "name_en", "governorate"]));
    expect(Object.keys(zone.properties as Json)).toEqual(expect.arrayContaining(["name_ar", "name_en"]));
  });

  it("R204: a quote has a packaging line, the tax basis and the two taxed totals", () => {
    const kinds = ((props("AmountLine").kind as Json).enum as string[]) ?? [];
    expect(kinds.indexOf("packaging")).toBe(kinds.indexOf("options") + 1);
    const quote = props("Quote");
    for (const key of [
      "tax_basis",
      "amount_ht_millimes",
      "amount_ttc_millimes",
      "departure_pinned",
      "arrival_pinned",
    ]) {
      expect(Object.keys(quote), key).toContain(key);
      expect(required("Quote"), key).toContain(key);
    }
    expect(JSON.stringify(quote.tax_basis)).toContain('"ttc"');
    expect(JSON.stringify(quote.tax_basis)).toContain('"ht"');
    expect(JSON.stringify(quote.tax_basis)).toContain('"null"');
  });

  it("GH-22 R204 R206: an order names the zone of each address and says when an address is unconfirmed", () => {
    const order = props("Order");
    expect(required("Order")).toEqual(expect.arrayContaining(["address_unconfirmed", "departure", "arrival"]));
    expect(order.address_unconfirmed).toMatchObject({ type: "boolean" });
    for (const side of ["departure", "arrival"]) expect(order[side]).toMatchObject({ $ref: "#/components/schemas/QuoteZone" });
  });

  it("GH-22 RV-05 R607: createOrder lists the 422 reasons it can answer", () => {
    const op = operations.find((o) => o.id === "createOrder")?.op as Json;
    for (const reason of [
      "quoteChanged",
      "phoneRequired",
      "contractRequired",
      "addressMismatch",
      "tooManyParcels",
      "freightPayerRequired",
    ])
      expect(String(op.description), reason).toContain(reason);
  });

  it("GH-22 R209 R212: confirmOrder names its 409 reason, and CancelRequest says what accepted_fee means for staff", () => {
    const confirm = operations.find((o) => o.id === "confirmOrder")?.op as Json;
    expect(String(confirm.description)).toContain("notWaitingForConfirmation");
    const fee = (schemas.CancelRequest?.properties as Record<string, Json>).accepted_fee as Json;
    expect(String(fee.description)).toMatch(/staff/i);
  });

  it("GH-22 R405 R903: the public tracking says that the city names follow Accept-Language", () => {
    const op = operations.find((o) => o.id === "getTracking")?.op as Json;
    expect(String(op.description)).toContain("Accept-Language");
  });
});
