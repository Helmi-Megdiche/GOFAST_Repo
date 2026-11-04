import { getTranslations } from "next-intl/server";
import { Container, Icon, Section, Timeline, TimelineItem } from "@fastgo/ui";
import { DriverForm } from "@/components/driver/driver-form";
import { PageHero } from "@/components/page-hero";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/livreur", "driver");

/** Become a driver (FE-05, W08-Livreur). */
export default async function DriverPage({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("driver");
  const needs = ["licence", "vehicle", "phone"] as const;
  const steps = ["apply", "check", "train", "activate"] as const;

  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} size="d1" />
      <Section compact>
        <Container className="flex flex-col gap-8 md:flex-row md:gap-12">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <h2 className="text-d3">{t("needs.title")}</h2>
            <ul className="flex flex-col gap-2">
              {needs.map((need) => (
                <li key={need} className="flex items-start gap-2.5">
                  <Icon name="check" className="mt-0.5 text-success" />
                  {t(`needs.${need}`)}
                </li>
              ))}
            </ul>
            <h2 className="mt-4 text-d3">{t("process.title")}</h2>
            <Timeline>
              {steps.map((step, index) => (
                <TimelineItem key={step} state={index === steps.length - 1 ? "current" : "done"}>
                  {t(`process.${step}`)}
                </TimelineItem>
              ))}
            </Timeline>
          </div>
          <DriverForm />
        </Container>
      </Section>
    </>
  );
}
