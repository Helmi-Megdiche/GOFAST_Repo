import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@fastgo/ui";
import { UiShowcase } from "@/components/dev/ui-showcase";
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
    <Container className="flex flex-col gap-12 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-d2">{t("title")}</h1>
        <p className="text-lead">{t("intro")}</p>
      </div>
      <UiShowcase />
    </Container>
  );
}
