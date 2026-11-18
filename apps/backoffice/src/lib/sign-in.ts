import type { components } from "@fastgo/contract";

export type Me = components["schemas"]["Me"];

/** What the screen does with the answer of POST /v1/staff/sessions. */
export type SignInOutcome =
  | { kind: "ok"; me: Me }
  | { kind: "invalid" }
  | { kind: "wait"; seconds: number }
  | { kind: "fields"; fields: ("identifier" | "password" | "code")[] }
  | { kind: "unavailable" };

export type RawAnswer = { status: number; headers: Headers; body: unknown } | null;

const FIELDS = ["identifier", "password", "code"] as const;
/** The wait when the answer has no usable Retry-After (the sign-in window of the API is 15 minutes; a minute is a prudent default). */
const DEFAULT_WAIT_SECONDS = 60;

/**
 * One neutral message for a 401 (it never says which part was wrong: the API gives the same answer for a wrong password, a wrong code,
 * a customer, an account with no second factor), the wait for a 429, the field errors for a 400, and "unavailable" for anything else.
 */
export function outcomeOf(answer: RawAnswer): SignInOutcome {
  if (!answer) return { kind: "unavailable" };
  if (answer.status === 201) return { kind: "ok", me: answer.body as Me };
  if (answer.status === 401) return { kind: "invalid" };
  if (answer.status === 429) {
    const seconds = Number.parseInt(answer.headers.get("Retry-After") ?? "", 10);
    return { kind: "wait", seconds: Number.isFinite(seconds) ? Math.max(1, seconds) : DEFAULT_WAIT_SECONDS };
  }
  if (answer.status === 400) {
    const fields = ((answer.body as { error?: { fields?: { name?: string }[] } } | undefined)?.error?.fields ?? [])
      .map((f) => f.name)
      .filter((name): name is (typeof FIELDS)[number] => (FIELDS as readonly string[]).includes(name ?? ""));
    return fields.length > 0 ? { kind: "fields", fields } : { kind: "unavailable" };
  }
  return { kind: "unavailable" };
}
