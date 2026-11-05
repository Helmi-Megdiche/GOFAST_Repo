import { ComingSoon } from "@/components/coming-soon";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte", "account", { noindex: true });

/** Default destination after sign-in (decision 17). The client space is Prompt 4. */
export default async function AccountPage({ params }: PageParams) {
  await resolveLocale(params);
  return <ComingSoon page="account" />;
}
