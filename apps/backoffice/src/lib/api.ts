import createClient from "openapi-fetch";
import type { paths } from "@fastgo/contract";
import type { RawAnswer } from "./sign-in";
import type { Me } from "./sign-in";

/** Typed client on the contract. Same origin: the browser calls /v1/... on this host and Next forwards it to the API (no CORS). */
export function createApiClient(options: { fetch?: (input: Request) => Promise<Response>; timeoutMs?: number } = {}) {
  const { timeoutMs = 10_000 } = options;
  const send = options.fetch ?? ((request: Request) => fetch(request));
  const guarded = async (input: Request): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await send(new Request(input, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  };
  return createClient<paths>({ baseUrl: "", fetch: guarded });
}
export type ApiClient = ReturnType<typeof createApiClient>;

/** POST /v1/staff/sessions. A cut or a timeout is `null` (the screen says the service does not answer). */
export async function signInStaff(client: ApiClient, body: { identifier: string; password: string; code: string }): Promise<RawAnswer> {
  try {
    const { data, error, response } = await client.POST("/v1/staff/sessions", { body });
    return { status: response.status, headers: response.headers, body: data ?? error };
  } catch {
    return null;
  }
}

export type MeAnswer = { status: "me"; me: Me } | { status: "none" } | { status: "error" };

/** GET /v1/me: the person behind the session cookie, `none` for a 401, `error` for anything else (the network, a 5xx). */
export async function fetchMe(client: ApiClient): Promise<MeAnswer> {
  try {
    const { data, response } = await client.GET("/v1/me");
    if (response.status === 401) return { status: "none" };
    if (response.ok && data) return { status: "me", me: data };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

/** DELETE /v1/sessions. Best effort: the cookie is gone on the server's answer, and a failure changes nothing for the screen. */
export async function signOutStaff(client: ApiClient): Promise<void> {
  try {
    await client.DELETE("/v1/sessions");
  } catch {
    /* the screen goes to the sign-in page anyway */
  }
}
