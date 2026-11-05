import { getTranslations } from "next-intl/server";
import { ReviewStep } from "@/components/order/review-step";
import { StepFrame } from "@/components/order/step-frame";
import { StepHeading } from "@/components/order/step-heading";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commander/verification", "orderReview", { noindex: true });

/** W15. The h1 is in the server HTML; the form needs the draft, read in the browser. */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("order.review");
  return (
    <StepFrame step="review">
      <ReviewStep heading={<StepHeading>{t("title")}</StepHeading>} />
    </StepFrame>
  );
}
