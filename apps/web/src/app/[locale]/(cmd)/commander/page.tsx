import { getTranslations } from "next-intl/server";
import { OrderEntry } from "@/components/order/order-entry";
import { StepFrame } from "@/components/order/step-frame";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commander", "order", { noindex: true });

/** /commander: opens the first incomplete step of the saved draft, or W11. */
export default async function OrderPage({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("comingSoon.pages");
  return (
    <StepFrame step={null}>
      <h1 className="sr-only">{t("order")}</h1>
      <OrderEntry />
    </StepFrame>
  );
}
