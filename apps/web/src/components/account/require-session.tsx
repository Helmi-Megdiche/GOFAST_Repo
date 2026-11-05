"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { guardDecision } from "@/lib/auth/guard";
import { useSession } from "@/lib/data/use-session";

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
  // undefined until the browser session is read: the busy placeholder stays.
  const decision = session === undefined ? null : guardDecision(session, { kind, role });
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
