import { OutOfZone } from "@/components/order/out-of-zone";
import { StepFrame } from "@/components/order/step-frame";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commander/hors-zone", "orderOutOfZone", { noindex: true });

/** W17: an address outside the served areas, before any price (R201). Its step (1 or 2) comes from the draft. */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <StepFrame step={null}>
      <OutOfZone />
    </StepFrame>
  );
}
