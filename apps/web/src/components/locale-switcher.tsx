"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localeLabels, switcherOrder, type Locale } from "@fastgo/i18n";
import { LanguageSwitcher } from "@fastgo/ui";
import { Link, usePathname } from "@/i18n/navigation";

type Variant = "on-dark" | "on-light";

/**
 * FR / EN / عربي. Keeps the current page, its query string (?n= on W16 and /suivi, ?next= on the
 * sign-in pages) and, through the next-intl Link, the NEXT_LOCALE cookie, so a visitor who picked
 * a language stays on it. The query is read in the browser: static pages render the links without
 * it (also what a visitor without JavaScript gets), and the same links gain it once hydrated.
 */
export function LocaleSwitcher({ variant = "on-dark" }: { variant?: Variant }) {
  const [search, setSearch] = useState("");
  return (
    <>
      {/* useSearchParams needs a Suspense boundary on static pages. Only this reader suspends,
          so the links themselves are never swapped for new elements. */}
      <Suspense fallback={null}>
        <SearchReader onChange={setSearch} />
      </Suspense>
      <Switcher variant={variant} search={search} />
    </>
  );
}

function SearchReader({ onChange }: { onChange: (search: string) => void }) {
  const search = useSearchParams().toString();
  useEffect(() => onChange(search), [search, onChange]);
  return null;
}

function Switcher({ variant, search }: { variant: Variant; search: string }) {
  const locale = useLocale();
  const t = useTranslations("languageSwitcher");
  const pathname = usePathname();
  const href = search ? `${pathname}?${search}` : pathname;

  const items = switcherOrder.map((code) => ({
    code,
    label: localeLabels[code],
    href,
  }));

  return (
    <LanguageSwitcher
      items={items}
      current={locale}
      label={t("label")}
      variant={variant}
      renderLink={(item, { className, children, current }) => (
        <Link
          href={href}
          locale={item.code as typeof locale}
          lang={item.code}
          hrefLang={item.code}
          aria-current={current ? "true" : undefined}
          // R902: signed in, the choice is saved on the account like C09 does; signed out, nothing is saved.
          onClick={() => {
            // Loaded on click: the account data layer stays out of the header bundle of every public page.
            void import("@/lib/data/profile").then((profile) =>
              profile.saveLocaleIfSignedIn(item.code as Locale),
            );
          }}
          className={className}
        >
          {children}
        </Link>
      )}
    />
  );
}
