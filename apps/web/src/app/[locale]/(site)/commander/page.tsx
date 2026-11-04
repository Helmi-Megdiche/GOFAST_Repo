import { ComingSoon } from "@/components/coming-soon";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commander", "order", { noindex: true });

/** The order flow is Prompt 3: until then the header button lands here. */
export default async function OrderPage({ params }: PageParams) {
  await resolveLocale(params);
  return <ComingSoon page="order" />;
}
