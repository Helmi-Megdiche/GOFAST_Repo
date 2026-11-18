"use client";

import { useEffect, type ReactNode } from "react";
import { isBackofficeRole } from "@fastgo/domain";
import { usePathname, useRouter } from "@/i18n/navigation";
import { guardDecision } from "@/lib/guard";
import { landingSlug, pathOf } from "@/lib/nav";
import { AppShell } from "./app-shell";
import { Busy, NoAccess, Unavailable } from "./guard-pages";
import { useSession } from "./session";

/**
 * The guard of the shell (ADR-2, as apps/web RequireSession): the session lives in the browser, so the server HTML is a busy placeholder and
 * the page's own h1; the decision runs once GET /v1/me has answered. The API checks again on every call, this only decides what to show:
 * no session goes to A00 with ?next=, a customer or a driver is signed out then sent to A00, a staff account with no back-office role goes to
 * /sans-role, a screen the role may not see is "no access" in place, "/" goes to the landing page of the role.
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { state, reload, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const target = pathname === "/" ? ({ kind: "landing" } as const) : ({ kind: "slug", slug: pathname.replace(/^\//, "").split("/")[0] ?? "" } as const);
  const decision = state.phase === "ready" ? guardDecision(state.me, target) : null;
  const action = decision?.action;
  const landing = decision?.action === "landing" ? decision.slug : null;

  useEffect(() => {
    if (action === "signIn") router.replace(pathname === "/" ? "/connexion" : { pathname: "/connexion", query: { next: pathname } });
    else if (action === "refuse") void signOut().then(() => router.replace({ pathname: "/connexion", query: { refused: "1" } }));
    else if (action === "noRole") router.replace("/sans-role");
    else if (landing) router.replace(pathOf(landing));
  }, [action, landing, pathname, router, signOut]);

  if (state.phase === "error") return <Unavailable onRetry={reload} />;
  if (state.phase !== "ready" || !decision) return <Busy />;
  if (decision.action !== "allow" && decision.action !== "noAccess" && decision.action !== "notFound") return <Busy />;
  const me = state.me;
  if (!me || !isBackofficeRole(me.role)) return <Busy />;
  return (
    <AppShell role={me.role} name={me.name ?? ""}>
      {decision.action === "noAccess" ? <NoAccess landing={pathOf(landingSlug(me.role))} /> : children}
    </AppShell>
  );
}
