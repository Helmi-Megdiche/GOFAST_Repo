import { useTranslations } from "next-intl";
import { ClaimDetailView } from "@/components/account/claim-detail";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale } from "@/lib/page";

type Props = { params: Promise<{ locale: string; ref: string }> };

export const generateMetadata = async ({ params }: Props) => {
  const { locale } = await params;
  return localizedMetadata(Promise.resolve({ locale }), "/compte/reclamations", "accountClaim", {
    noindex: true,
  });
};

/** C07, one claim (ESP-06). The reference is read from the URL, the claim from the data layer on the client. */
export default async function ClaimPage({ params }: Props) {
  const { locale, ref } = await params;
  await resolveLocale(Promise.resolve({ locale }));
  return <Claim reference={ref} />;
}

function Claim({ reference }: { reference: string }) {
  const t = useTranslations("claims.detail");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <ClaimDetailView reference={decodeURIComponent(reference)} />
      </RequireSession>
    </>
  );
}
