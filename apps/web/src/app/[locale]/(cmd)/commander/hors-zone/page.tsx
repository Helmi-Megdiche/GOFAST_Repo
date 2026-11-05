import { OutOfZone } from "@/components/order/out-of-zone";
import { StepFrame } from "@/components/order/step-frame";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commander/hors-zone", "orderOutOfZone", { noindex: true });

/** W17: an address outside the served areas, before any price (R201). */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <StepFrame step="recipient">
      <OutOfZone />
    </StepFrame>
  );
}
