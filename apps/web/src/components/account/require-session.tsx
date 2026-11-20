"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { guardDecision } from "@/lib/auth/guard";
import { useSession } from "@/lib/data/use-session";
import { sharedAuthPort } from "@/lib/data";

/**
 * The guard of a space page (ADR-2). The session lives in the browser, so the server HTML is the
 * page's h1 (outside this component) and a busy placeholder; the decision runs after mount. The
 * real API checks again: this only decides what to show.
 */
export function RequireSession({
  kind,
  role,
  children,
}: {
  kind: "customer" | "merchant";
  role?: "admin" | "user";
  children: ReactNode;
}) {
  const t = useTranslations("account.guard");
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  // Api: the cookie is the authority, so ask GET /v1/me once before deciding (a 401 clears the copy).
  // Mock: nothing to ask.
  const [checked, setChecked] = useState(sharedAuthPort().kind === "mock");
  useEffect(() => {
    if (checked) return;
    let live = true;
    void sharedAuthPort()
      .refreshSession()
      .finally(() => {
        if (live) setChecked(true);
      });
    return () => {
      live = false;
    };
  }, [checked]);
  // undefined until the browser session is read: the busy placeholder stays.
  const decision =
    session === undefined || !checked ? null : guardDecision(session, { kind, role });
  const action = decision?.action;
  const target = decision?.action === "redirect" ? decision.to : null;

  useEffect(() => {
    if (action === "signIn") router.replace({ pathname: "/connexion", query: { next: pathname } });
    else if (target) router.replace(target);
  }, [action, target, pathname, router]);

  if (decision?.action === "allow") return <>{children}</>;
  if (decision?.action === "notAllowed") return <p>{t("notAllowed")}</p>;
  return (
    <>
      <p aria-busy="true" className="text-muted">
        {t("busy")}
      </p>
      <noscript>
        <p>{t("noscript")}</p>
      </noscript>
    </>
  );
}
