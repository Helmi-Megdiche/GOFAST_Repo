import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@fastgo/i18n";
import { routing } from "@/i18n/routing";
import { pageMetadata, type PageKey } from "@/lib/seo";

export type PageParams = { params: Promise<{ locale: string }> };

/** First line of every server page: check the language, then keep the page statically rendered. */
export async function resolveLocale(params: PageParams["params"]): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return locale;
}

/** generateMetadata for a page with a fixed path: title, description, canonical and hreflang. */
export async function localizedMetadata(
  params: PageParams["params"],
  path: string,
  key: PageKey,
  options: { noindex?: boolean } = {},
): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return pageMetadata({ locale, path, key, noindex: options.noindex });
}
