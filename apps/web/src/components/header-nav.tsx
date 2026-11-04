"use client";

import { useTranslations } from "next-intl";
import { cn } from "@fastgo/ui";
import { Link, usePathname } from "@/i18n/navigation";
import { isActivePath, NAV_ITEMS } from "./nav-items";

/** Main links. The page you are on carries aria-current="page" and the orange accent. */
export function HeaderNav({
  className,
  linkClassName,
  onNavigate,
}: {
  className?: string;
  linkClassName?: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className={className}>
      <ul className="flex flex-col gap-0.5 md:flex-row md:items-center">
        {NAV_ITEMS.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
              className={cn(
                "block rounded-sm px-2 py-2 text-sm font-medium whitespace-nowrap text-on-inverse no-underline",
                "aria-[current=page]:font-semibold aria-[current=page]:text-accent-on-inverse",
                linkClassName,
              )}
            >
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
