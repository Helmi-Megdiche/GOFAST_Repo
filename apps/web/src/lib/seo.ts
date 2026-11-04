import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales, type Locale, type Messages } from "@fastgo/i18n";

/**
 * Public site address. The domain is not decided: set NEXT_PUBLIC_SITE_URL in .env.local
 * (see .env.example). Used to turn the relative canonical and hreflang links into absolute ones.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export type PageKey = keyof Messages["meta"]["pages"];

/**
 * Basic SEO only (FE-08 is L2): a title and a description per page and language, a canonical
 * link and the hreflang alternates. No sitemap, no structured data, no city pages.
 * `path` starts with "/" ("" for the home page).
 */
export async function pageMetadata({
  locale,
  path,
  key,
  noindex,
}: {
  locale: Locale;
  path: string;
  key: PageKey;
  /** Pages that only say "coming soon". */
  noindex?: boolean;
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "meta" });
  const url = (code: Locale) => `/${code}${path}`;

  return {
    title: t(`pages.${key}.title`),
    description: t(`pages.${key}.description`),
    alternates: {
      canonical: url(locale),
      languages: {
        ...Object.fromEntries(locales.map((code) => [code, url(code)])),
        "x-default": url("fr"),
      },
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}
