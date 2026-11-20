"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { profilePort } from "@/lib/data";
import { featureAvailable } from "./feature-available";
import { useSession } from "@/lib/data/use-session";
import { visibleNav } from "./space-nav-items";

/** Nav of a space: only entries whose page exists, and for the role of the person signed in. */
export function SpaceNav({ kind }: { kind: "customer" | "merchant" }) {
  const t = useTranslations("account.nav");
  const pathname = usePathname();
  // The role lives in the browser session: null on the server, so the server HTML is the same.
  const role = useSession()?.role ?? null;
  const port = profilePort();

  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-wrap gap-2 md:flex-col">
        {visibleNav(kind, role, (feature) => featureAvailable(port, feature)).map((entry) => (
          <li key={entry.key}>
            <Link
              href={entry.href}
              aria-current={pathname === entry.href ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-md px-3 font-semibold text-ink hover:bg-fill aria-[current=page]:bg-fill"
            >
              {t(entry.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
