import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type LanguageItem = {
  /** Locale code: fr, en, ar. Also the lang attribute of the link. */
  code: string;
  /** Short label in its own language: FR, EN, عربي. */
  label: string;
  href: string;
};

export type LanguageSwitcherProps = {
  items: LanguageItem[];
  current: string;
  /** Accessible name of the group, translated. */
  label: string;
  /** on-dark for the navy header; on-light for white backgrounds. */
  variant?: "on-dark" | "on-light";
  /**
   * Render the link yourself (e.g. with the next-intl Link, to keep the current page and
   * set the locale cookie). Receives the class names and content to put on the element.
   */
  renderLink?: (
    item: LanguageItem,
    props: { className: string; children: ReactNode; current: boolean },
  ) => ReactNode;
  className?: string;
};

const LINK =
  "flex h-11 min-w-11 items-center justify-center px-2.5 text-xs font-medium no-underline md:h-8";

const VARIANTS = {
  "on-dark": {
    box: "border-white/40",
    link: "text-white",
    active: "bg-white font-bold text-navy-deep",
  },
  "on-light": {
    box: "border-field-border",
    link: "text-ink",
    active: "bg-navy font-bold text-white",
  },
} as const;

export function LanguageSwitcher({
  items,
  current,
  label,
  variant = "on-dark",
  renderLink,
  className,
}: LanguageSwitcherProps) {
  const styles = VARIANTS[variant];

  return (
    <div
      role="group"
      aria-label={label}
      data-inverse={variant === "on-dark" ? "" : undefined}
      className={cn(
        "inline-flex flex-none overflow-hidden rounded-sm border",
        styles.box,
        className,
      )}
    >
      {items.map((item) => {
        const isCurrent = item.code === current;
        // Active and inactive colors are exclusive: both text colors together would let
        // the stylesheet order decide, and white-on-white hid the current language.
        const className = cn(LINK, isCurrent ? styles.active : styles.link);
        if (renderLink) {
          return (
            <span key={item.code} className="contents">
              {renderLink(item, { className, children: item.label, current: isCurrent })}
            </span>
          );
        }
        return (
          <a
            key={item.code}
            href={item.href}
            lang={item.code}
            hrefLang={item.code}
            aria-current={isCurrent ? "true" : undefined}
            className={className}
          >
            {item.label}
          </a>
        );
      })}
    </div>
  );
}
