import { ComingSoon } from "@/components/coming-soon";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/inscription", "signUp", { noindex: true });

/** Sign-up is Prompt 3: the merchants page "Créer un compte" button lands here. */
export default async function SignUpPage({ params }: PageParams) {
  await resolveLocale(params);
  return <ComingSoon page="signUp" />;
}
