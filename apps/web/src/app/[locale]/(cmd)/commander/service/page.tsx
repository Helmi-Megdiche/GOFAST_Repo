import { getTranslations } from "next-intl/server";
import { ServiceStep } from "@/components/order/service-step";
import { StepFrame } from "@/components/order/step-frame";
import { StepHeading } from "@/components/order/step-heading";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commander/service", "orderService", { noindex: true });

/** W14. The h1 is in the server HTML; the form needs the draft, read in the browser. */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("order.service");
  return (
    <StepFrame step="service">
      <ServiceStep heading={<StepHeading>{t("title")}</StepHeading>} />
    </StepFrame>
  );
}
