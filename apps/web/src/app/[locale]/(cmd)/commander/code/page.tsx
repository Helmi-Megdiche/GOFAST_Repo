import { getTranslations } from "next-intl/server";
import { OrderCodeStep } from "@/components/order/order-code-step";
import { StepFrame } from "@/components/order/step-frame";
import { StepHeading } from "@/components/order/step-heading";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commander/code", "orderCode", { noindex: true });

/** W20 inside the order flow (CMD-03), on the cmd chrome with the stepper at step 5. */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("auth.code");
  return (
    <StepFrame step="review">
      <OrderCodeStep
        heading={<StepHeading className="text-d3 outline-none">{t("title")}</StepHeading>}
      />
    </StepFrame>
  );
}
