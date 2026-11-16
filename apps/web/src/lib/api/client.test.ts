import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { SESSION_KEY, getSession, setSession } from "../data/session";
import { useMemoryStorage as freshStorage } from "../storage";
import { NetworkError } from "./errors";

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

describe("api client (fake fetch, no network)", () => {
  it("calls the same origin /v1 path, with the language and the cookie when given", async () => {
    const fetchImpl = vi.fn(async () => json(200, { status: "ok" }));
    const client = createApiClient({
      fetch: fetchImpl,
      locale: "ar",
      cookie: "sid=abc",
      baseUrl: "http://web.test",
    });
    await client.GET("/v1/health");
    const request = (fetchImpl.mock.calls as unknown as [Request][])[0]![0];
    expect(new URL(request.url).pathname).toBe("/v1/health");
    expect(request.headers.get("accept-language")).toBe("ar");
    expect(request.headers.get("cookie")).toBe("sid=abc");
  });

  it("a failed fetch becomes NetworkError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = createApiClient({ fetch: fetchImpl, baseUrl: "http://web.test" });
    await expect(client.GET("/v1/health")).rejects.toBeInstanceOf(NetworkError);
  });

  it("a call that takes longer than the timeout becomes NetworkError", async () => {
    const fetchImpl = vi.fn(
      (input: Request) =>
        new Promise<Response>((_, reject) => {
          input.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const client = createApiClient({ fetch: fetchImpl, baseUrl: "http://web.test", timeoutMs: 20 });
    await expect(client.GET("/v1/health")).rejects.toBeInstanceOf(NetworkError);
  });

  describe("a 401 clears the session copy (Change B)", () => {
    const session = {
      accountId: "acc-1",
      userId: "acc-1",
      role: null,
      kind: "customer" as const,
      contract: null,
      phoneVerified: true,
      maskedPhone: "+216 ** *** 123",
    };
    const call = async (status: number, clearSessionOn401: boolean) => {
      freshStorage();
      setSession(session);
      const client = createApiClient({
        fetch: vi.fn(async () =>
          json(status, {
            error: { code: "AUTH_REQUIRED", message: "x", fields: [], trace_id: "t" },
          }),
        ),
        baseUrl: "http://web.test",
        clearSessionOn401,
      });
      await client.GET("/v1/me");
    };

    it("any 401 from any /v1 call removes the copy when the auth domain is on the API", async () => {
      await call(401, true);
      expect(getSession()).toBeNull();
    });

    it("another status keeps the copy", async () => {
      await call(500, true);
      expect(getSession()).toEqual(session);
    });

    it("on the mock (option off) a 401 keeps the copy", async () => {
      await call(401, false);
      expect(getSession()).toEqual(session);
      expect(SESSION_KEY).toBe("fg.mock.session");
    });
  });
});
