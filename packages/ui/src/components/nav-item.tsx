import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icon";
import type { IconName } from "../icons/icon-map";

type NavItemOwnProps = {
  /** Render as a router link (`as={Link}`); a plain `<a>` by default. */
  as?: ElementType;
  icon?: IconName;
  /** A badge with a number (to confirm, open incidents). Omit for none. */
  count?: number;
  /** The page the visitor is on: marked with aria-current="page". */
  current?: boolean;
  children: ReactNode;
};

export type NavItemProps = NavItemOwnProps & Omit<ComponentPropsWithoutRef<"a">, keyof NavItemOwnProps>;

/** One entry of the back-office sidebar: a list item holding a link (fg.css .ad-s a). The current page is read from ARIA. */
export function NavItem({ as, icon, count, current, className, children, ...rest }: NavItemProps) {
  const Component: ElementType = as ?? "a";
  return (
    <li>
      <Component
        {...rest}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white no-underline",
          "hover:bg-navy-3 aria-[current=page]:bg-orange aria-[current=page]:text-navy-deep",
          className,
        )}
      >
        {icon ? <Icon name={icon} size="md" /> : null}
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {count === undefined ? null : (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">{count}</span>
        )}
      </Component>
    </li>
  );
}
