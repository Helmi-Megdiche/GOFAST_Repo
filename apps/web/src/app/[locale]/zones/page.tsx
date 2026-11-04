import { getTranslations } from "next-intl/server";
import { Container, Section } from "@fastgo/ui";
import { PageHero } from "@/components/page-hero";
import { ZoneCheckForm } from "@/components/zones/zone-check-form";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/zones", "zones");

/** Served areas (FE-04, W05-Zones), without the schematic map (FE-10 is L2). */
export default async function ZonesPage({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("zones");
  const p = await getTranslations("placeholders");

  return (
    <>
      <PageHero title={t("title")} lead={t("launch", { city: p("city") })} />
      <Section compact>
        <Container>
          <ZoneCheckForm />
        </Container>
      </Section>
    </>
  );
}
