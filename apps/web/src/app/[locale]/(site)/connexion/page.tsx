import { ComingSoon } from "@/components/coming-soon";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/connexion", "signIn", { noindex: true });

/** Sign-in is Prompt 3: until then the header button lands here. */
export default async function SignInPage({ params }: PageParams) {
  await resolveLocale(params);
  return <ComingSoon page="signIn" />;
}
