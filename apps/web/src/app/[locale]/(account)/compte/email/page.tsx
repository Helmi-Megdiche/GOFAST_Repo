import { useTranslations } from "next-intl";
import { EmailScreen } from "@/components/account/email-screen";
import { FeatureGate } from "@/components/account/feature-gate";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte/email", "accountEmail", { noindex: true });

/** ESP-01, R101: add or change the e-mail of the account, confirmed with a code. */
export default async function EmailPage({ params }: PageParams) {
  await resolveLocale(params);
  return <EmailContent />;
}

function EmailContent() {
  const t = useTranslations("emailScreen");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <FeatureGate feature="email">
          {" "}
          <EmailScreen />
        </FeatureGate>
      </RequireSession>
    </>
  );
}
