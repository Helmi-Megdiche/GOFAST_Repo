import { useTranslations } from "next-intl";
import { AccountHomeView } from "@/components/account/account-home";
import { FeatureGate } from "@/components/account/feature-gate";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte", "account", { noindex: true });

/**
 * C01 (ESP-03). The server HTML is the h1 and a busy placeholder; the session lives in the browser,
 * so the guard and the data come after mount. Default destination after sign-in for a customer.
 */
export default async function AccountPage({ params }: PageParams) {
  await resolveLocale(params);
  return <AccountHome />;
}

function AccountHome() {
  const t = useTranslations("account.home");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <FeatureGate feature="home">
          <AccountHomeView />
        </FeatureGate>
      </RequireSession>
    </>
  );
}
