import { homeFor, type Session } from "../data/session";

export type GuardDecision =
  | { action: "allow" }
  | { action: "signIn" }
  | { action: "redirect"; to: "/compte" | "/pro" }
  | { action: "notAllowed" };

/**
 * What a space page does with the session (ADR-2, H5): no session goes to sign-in, the other
 * space's person goes to their own home, a role-restricted page shows "not allowed" to the wrong
 * role. The pages show only; the real API checks again.
 */
export function guardDecision(
  session: Session | null,
  need: { kind: "customer" | "merchant"; role?: "admin" | "user" },
): GuardDecision {
  if (!session) return { action: "signIn" };
  if (session.kind !== need.kind) return { action: "redirect", to: homeFor(session) };
  if (need.role && session.role !== need.role) return { action: "notAllowed" };
  return { action: "allow" };
}
