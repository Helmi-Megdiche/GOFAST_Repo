import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { StepBusy } from "@/components/order/busy";
import { Confirmation } from "@/components/order/confirmation";
import { StepFrame } from "@/components/order/step-frame";
import { StepHeading } from "@/components/order/step-heading";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commander/confirmation", "orderConfirmation", { noindex: true });

/** W16 (CMD-06). The stepper ends on step 5, as in the mockup. ?n= is read in the browser so the page stays static; no cancel button (CMD-08: Prompt 4). */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("order.confirmation");
  const heading = <StepHeading>{t("title")}</StepHeading>;
  return (
    <StepFrame step="review">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            {heading}
            <StepBusy />
          </div>
        }
      >
        <Confirmation heading={heading} />
      </Suspense>
    </StepFrame>
  );
}
