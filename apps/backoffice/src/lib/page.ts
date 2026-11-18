import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@fastgo/i18n";
import { routing } from "@/i18n/routing";

export type PageParams = { params: Promise<{ locale: string }> };

/** First line of every server page: check the language, then keep the page statically rendered. */
export async function resolveLocale(params: PageParams["params"]): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return locale;
}
