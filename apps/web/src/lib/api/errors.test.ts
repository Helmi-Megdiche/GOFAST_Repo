import { describe, expect, it } from "vitest";
import { NetworkError, mapOrderFailure, traceIdOf } from "./errors";

const body = (code: string, fields: { name: string; reason: string }[] = []) => ({
  error: { code, message: "Texte du serveur", fields, trace_id: "tr-1" },
});

describe("mapOrderFailure: ErrorBody to the existing UI errors", () => {
  const table: [number, string, { name: string; reason: string }[], string][] = [
    [409, "KEY_REUSED", [], "idempotencyConflict"],
    [410, "QUOTE_EXPIRED", [], "quoteExpired"],
    [422, "RULE_REFUSED", [{ name: "departure", reason: "outOfZone" }], "outOfZone"],
    [422, "RULE_REFUSED", [{ name: "phone_check_id", reason: "phoneRequired" }], "phoneNotVerified"],
    [422, "RULE_REFUSED", [{ name: "accepted_total_millimes", reason: "quoteChanged" }], "quoteNotAccepted"],
  ];
  it.each(table)("%i %s %j gives %s", (status, code, fields, expected) => {
    expect(mapOrderFailure(status, body(code, fields))).toEqual({ kind: "refused", error: expected });
  });

  it("an unknown 422 reason, or any other code, is a generic server error (no server text)", () => {
    const unknown = mapOrderFailure(422, body("RULE_REFUSED", [{ name: "x", reason: "newReason" }]));
    expect(unknown).toEqual({ kind: "server", traceId: "tr-1" });
    expect(JSON.stringify(unknown)).not.toContain("Texte du serveur");
    expect(mapOrderFailure(500, body("INTERNAL_ERROR"))).toEqual({ kind: "server", traceId: "tr-1" });
  });

  it("401 asks for sign-in, 429 is too many attempts", () => {
    expect(mapOrderFailure(401, body("AUTH_REQUIRED"))).toEqual({ kind: "signIn" });
    expect(mapOrderFailure(429, body("TOO_MANY_ATTEMPTS"))).toEqual({ kind: "tooManyAttempts" });
  });

  it("an answer that is not an ErrorBody is a server error without trace id", () => {
    expect(mapOrderFailure(502, "<html>bad gateway</html>")).toEqual({ kind: "server", traceId: null });
  });

  it("keeps the trace id for the error screen or the log", () => {
    expect(traceIdOf(body("INTERNAL_ERROR"))).toBe("tr-1");
    expect(traceIdOf(undefined)).toBeNull();
  });

  it("NetworkError keeps its name", () => {
    expect(new NetworkError().name).toBe("NetworkError");
  });
});
