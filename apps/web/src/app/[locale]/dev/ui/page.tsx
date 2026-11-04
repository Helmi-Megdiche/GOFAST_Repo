import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UiShowcase } from "@/components/dev/ui-showcase";
import { SiteHeader } from "@/components/site-header";
import { routing } from "@/i18n/routing";

// Internal page: 404 in production unless FG_DEV_UI=1 (set for the Playwright build).
const enabled = process.env.NODE_ENV !== "production" || process.env.FG_DEV_UI === "1";

export default async function DevUiPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!enabled) notFound();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("devUi");

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-10 md:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-d2">{t("title")}</h1>
          <p className="text-lead">{t("intro")}</p>
        </div>
        <UiShowcase />
      </main>
    </>
  );
}
