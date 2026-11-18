import { isBackofficeRole, safeNext } from "@fastgo/domain";
import { canOpen, itemOfSlug, landingSlug, pathOf } from "./nav";

/** The part of `Me` the guard reads. */
export type MeLike = { kind: string; role: string | null; name?: string | null };

export type Target = { kind: "landing" } | { kind: "slug"; slug: string };

export type Decision =
  | { action: "signIn" }
  | { action: "refuse" }
  | { action: "noRole" }
  | { action: "noAccess" }
  | { action: "notFound" }
  | { action: "allow" }
  | { action: "landing"; slug: string };

/**
 * What the shell shows, from GET /v1/me (null = 401). The API checks again on every call: this only decides what the browser offers.
 * - no session: the sign-in page;
 * - not a staff account, or a driver: the session is closed and the sign-in page says so neutrally;
 * - a staff account with no back-office role (null, hr, unknown): the "no role yet" page;
 * - a screen the role may not see: "no access" in place;
 * - "/": the landing page of the role.
 */
export function guardDecision(me: MeLike | null, target: Target): Decision {
  if (me === null) return { action: "signIn" };
  if (me.kind !== "staff" || me.role === "driver") return { action: "refuse" };
  if (!isBackofficeRole(me.role)) return { action: "noRole" };
  if (target.kind === "landing") return { action: "landing", slug: landingSlug(me.role) };
  if (itemOfSlug(target.slug) === undefined) return { action: "notFound" };
  return canOpen(me.role, target.slug) ? { action: "allow" } : { action: "noAccess" };
}

/**
 * Where A00 goes after a sign-in: `?next=` only when it is a same-site path to a screen the role may see, otherwise the landing page.
 * The path has no language (the router adds it).
 */
export function afterSignInPath(role: Parameters<typeof landingSlug>[0], next: string | null | undefined): string {
  if (typeof next !== "string" || next === "") return pathOf(landingSlug(role));
  const path = (safeNext(next).split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  const slug = path.replace(/^\//, "");
  return canOpen(role, slug) ? pathOf(slug) : pathOf(landingSlug(role));
}
