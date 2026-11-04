import { HelpCenter } from "@/components/help/help-center";
import { getFaq } from "@/lib/data/faq";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/aide", "help");

/** Help and FAQ (FE-05, W06-Aide). */
export default async function HelpPage({ params }: PageParams) {
  await resolveLocale(params);
  const faq = await getFaq();
  return <HelpCenter faq={faq} />;
}
