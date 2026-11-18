import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@fastgo/ui";
import { routing } from "@/i18n/routing";
import { NAV_ITEMS, itemOfSlug } from "@/lib/nav";
import { resolveLocale } from "@/lib/page";

type Props = { params: Promise<{ locale: string; section: string }> };

// One placeholder per item of the sidebar, French slugs in every language. Anything else is a 404.
export const dynamicParams = false;
export function generateStaticParams() {
  return routing.locales.flatMap((locale) => NAV_ITEMS.map((item) => ({ locale, section: item.slug })));
}

/** A screen of the back-office, as a placeholder: the title, and an empty state. The screens are #26 and later; the dashboard too. */
export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  const locale = await resolveLocale(params);
  const item = itemOfSlug(section);
  if (!item) notFound();
  const t = await getTranslations({ locale, namespace: "backoffice" });
  return (
    <>
      <PageHeader title={t(`nav.items.${item.label}`)} />
      <Card className="flex flex-col gap-2">
        <p className="text-h4">{t("placeholder.title")}</p>
        <p className="text-muted">{t("placeholder.text")}</p>
      </Card>
    </>
  );
}
