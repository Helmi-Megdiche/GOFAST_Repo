import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { ClaimNew } from "@/components/account/claim-new";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte/reclamations/nouvelle", "accountClaimNew", { noindex: true });

/** C07, new claim (ESP-06). `?commande=` and `?facture=` are read on the client, inside Suspense. */
export default async function NewClaimPage({ params }: PageParams) {
  await resolveLocale(params);
  return <NewClaim />;
}

function NewClaim() {
  const t = useTranslations("claims.new");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <Suspense>
          <ClaimNew />
        </Suspense>
      </RequireSession>
    </>
  );
}
