import { useTranslations } from "next-intl";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte", "account", { noindex: true });

const SLOTS = [
  "inProgress",
  "lastDeliveries",
  "toSettle",
  "frequentRecipients",
  "installBanner",
] as const;

/**
 * C01 skeleton (ESP-02): the h1 and the named slots that parts A, B and G fill. Default
 * destination after sign-in for a customer (decision 17).
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
        {SLOTS.map((slot) => (
          <section key={slot} aria-label={t(`slots.${slot}`)} data-slot={slot} />
        ))}
      </RequireSession>
    </>
  );
}
