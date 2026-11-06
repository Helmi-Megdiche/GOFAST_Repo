import { useTranslations } from "next-intl";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/pro", "pro", { noindex: true });

const SLOTS = ["inProgress", "lastDeliveries", "cod", "chart"] as const;

/** P01 skeleton (PRO-01): the h1 and the named slots that the merchant parts fill. */
export default async function ProPage({ params }: PageParams) {
  await resolveLocale(params);
  return <ProHome />;
}

function ProHome() {
  const t = useTranslations("account.pro");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="merchant">
        {SLOTS.map((slot) => (
          <section key={slot} aria-label={t(`slots.${slot}`)} data-slot={slot} />
        ))}
      </RequireSession>
    </>
  );
}
