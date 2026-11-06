import { useTranslations } from "next-intl";
import { InvoicesList } from "@/components/account/invoices-list";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte/factures", "accountInvoices", { noindex: true });

/** C04 (ESP-05): invoices, receipts and credit notes of the account. */
export default async function InvoicesPage({ params }: PageParams) {
  await resolveLocale(params);
  return <Invoices />;
}

function Invoices() {
  const t = useTranslations("invoices.list");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <InvoicesList />
      </RequireSession>
    </>
  );
}
