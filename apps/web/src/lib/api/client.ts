import createClient from "openapi-fetch";
import type { paths } from "@fastgo/contract";
import { clearSessionCopy } from "../data/session";
import { usesApi } from "./domains";
import { NetworkError } from "./errors";

export type ApiClientOptions = {
  /** Defaults to the global fetch. Tests pass a fake. */
  fetch?: (input: Request) => Promise<Response>;
  locale?: string;
  /** Server-side only: forwarded so the API sees the visitor's session. */
  cookie?: string;
  /** Browser: empty (same origin, /v1 is rewritten by Next). Server: API_ORIGIN. */
  baseUrl?: string;
  timeoutMs?: number;
  /** Any 401 drops the local session copy (the cookie is gone). Default: on when auth is on the API. */
  clearSessionOn401?: boolean;
};

/** Typed client on the contract. A cut or a timeout becomes NetworkError (the "lost answer" path). */
export function createApiClient(options: ApiClientOptions = {}) {
  const { locale, cookie, timeoutMs = 10_000 } = options;
  const clearOn401 = options.clearSessionOn401 ?? usesApi("auth");
  const baseUrl =
    options.baseUrl ?? (typeof window === "undefined" ? (process.env.API_ORIGIN ?? "") : "");
  const send = options.fetch ?? ((request: Request) => fetch(request));

  const guarded = async (input: Request): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await send(new Request(input, { signal: controller.signal }));
      if (response.status === 401 && clearOn401) clearSessionCopy();
      return response;
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  };

  const headers: Record<string, string> = {};
  if (locale) headers["Accept-Language"] = locale;
  if (cookie) headers.Cookie = cookie;

  return createClient<paths>({ baseUrl, headers, fetch: guarded });
}
