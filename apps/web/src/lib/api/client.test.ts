import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { NetworkError } from "./errors";

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

describe("api client (fake fetch, no network)", () => {
  it("calls the same origin /v1 path, with the language and the cookie when given", async () => {
    const fetchImpl = vi.fn(async () => json(200, { status: "ok" }));
    const client = createApiClient({ fetch: fetchImpl, locale: "ar", cookie: "sid=abc", baseUrl: "http://web.test" });
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
          input.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const client = createApiClient({ fetch: fetchImpl, baseUrl: "http://web.test", timeoutMs: 20 });
    await expect(client.GET("/v1/health")).rejects.toBeInstanceOf(NetworkError);
  });
});
