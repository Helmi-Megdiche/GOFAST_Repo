import { useTranslations } from "next-intl";
import { ClaimsList } from "@/components/account/claims-list";
import { FeatureGate } from "@/components/account/feature-gate";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte/reclamations", "accountClaims", { noindex: true });

/** C06 (ESP-06): the account's claims. */
export default async function ClaimsPage({ params }: PageParams) {
  await resolveLocale(params);
  return <Claims />;
}

function Claims() {
  const t = useTranslations("claims.list");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <FeatureGate feature="claims">
          {" "}
          <ClaimsList />
        </FeatureGate>
      </RequireSession>
    </>
  );
}
