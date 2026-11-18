"use client";

import { useLocale, useTranslations } from "next-intl";
import { localeLabels, switcherOrder } from "@fastgo/i18n";
import { LanguageSwitcher } from "@fastgo/ui";
import { Link, usePathname } from "@/i18n/navigation";

/** FR / EN / عربي on the page the person is on (the next-intl link also saves the language in the NEXT_LOCALE cookie). */
export function LocaleSwitcher({ variant = "on-dark" }: { variant?: "on-dark" | "on-light" }) {
  const locale = useLocale();
  const t = useTranslations("languageSwitcher");
  const pathname = usePathname();
  return (
    <LanguageSwitcher
      items={switcherOrder.map((code) => ({ code, label: localeLabels[code], href: pathname }))}
      current={locale}
      label={t("label")}
      variant={variant}
      renderLink={(item, { className, children, current }) => (
        <Link
          href={pathname}
          locale={item.code as typeof locale}
          lang={item.code}
          hrefLang={item.code}
          aria-current={current ? "true" : undefined}
          className={className}
        >
          {children}
        </Link>
      )}
    />
  );
}
