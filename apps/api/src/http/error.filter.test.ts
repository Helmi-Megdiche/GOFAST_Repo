import { describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { ErrorFilter, describe as describeError } from "./error.filter.ts";

describe("describe (what the logs may say about an unknown error)", () => {
  it("gives the class, the Postgres code and the constraint, found down the cause chain", () => {
    const pg = Object.assign(new Error("duplicate key value violates unique constraint (+21620111001)"), {
      code: "23505",
      constraint: "accounts_phone_key",
    });
    const wrapped = new Error('Failed query: insert into core.accounts values ($1) params: +21620111001, $argon2id$v=19', {
      cause: pg,
    });
    expect(describeError(wrapped)).toBe("Error pg=23505 constraint=accounts_phone_key");
  });

  it("never carries the message, the stack, the SQL or a parameter", () => {
    const e = Object.assign(new TypeError("secret +21620111001 $argon2id$v=19$m=19456"), {
      query: "insert into core.accounts",
      params: ["+21620111001"],
    });
    const out = describeError(e);
    expect(out).toBe("TypeError");
    expect(out).not.toMatch(/\+216|argon2|insert/i);
  });

  it("ignores a code that is not a Postgres code and a constraint that is not a name", () => {
    expect(describeError(Object.assign(new Error("x"), { code: "ECONNRESET", constraint: "a b; drop" }))).toBe("Error");
    expect(describeError("a string with +21620111001")).toBe("string");
    expect(describeError(null)).toBe("object");
  });
});

describe("GH-22 RV-22: a database error that reaches the client is a 500 with a trace_id and no table or constraint name", () => {
  const cases: Array<[string, string, string]> = [
    ["23514", "orders_pickup_slot", 'new row for relation "orders" violates check constraint "orders_pickup_slot"'],
    ["23505", "orders_tracking_number_key", 'duplicate key value violates unique constraint "orders_tracking_number_key"'],
    ["23503", "orders_departure_zone_id_fkey", 'insert or update on table "orders" violates foreign key constraint "orders_departure_zone_id_fkey"'],
  ];
  for (const [code, constraint, message] of cases) {
    it(`${code} (${constraint})`, () => {
      const pg = Object.assign(new Error(message), { code, constraint, table: "orders", detail: "Key (sender_phone)=(+21620111001) is not present" });
      const error = new Error("Failed query: insert into core.orders ... params: +21620111001", { cause: pg });
      const sent: { status?: number; body?: unknown } = {};
      const reply = { header: vi.fn(), status(n: number) { sent.status = n; return this; }, send(b: unknown) { sent.body = b; return this; } };
      const host = { switchToHttp: () => ({ getRequest: () => ({ method: "POST", url: "/v1/orders", id: "trace-1", headers: {} }), getResponse: () => reply }) };
      const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
      new ErrorFilter().catch(error, host as never);
      const text = JSON.stringify(sent.body);
      expect(sent.status).toBe(500);
      expect(sent.body).toMatchObject({ error: { code: "INTERNAL_ERROR", trace_id: "trace-1" } });
      for (const secret of [constraint, "orders", "core.", "violates", "+216", "sender_phone", code]) expect(text, secret).not.toContain(secret);
      // the log may name the Postgres code and the constraint (never the message or a parameter)
      expect(String(log.mock.calls[0]?.[0])).toContain(`pg=${code}`);
      expect(String(log.mock.calls[0]?.[0])).not.toMatch(/\+216|insert into/);
      log.mockRestore();
    });
  }
});
