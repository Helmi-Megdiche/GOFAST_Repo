import { useTranslations } from "next-intl";
import { InvoiceDetailView } from "@/components/account/invoice-detail";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale } from "@/lib/page";

type Props = { params: Promise<{ locale: string; number: string }> };

export const generateMetadata = async ({ params }: Props) => {
  const { locale } = await params;
  return localizedMetadata(Promise.resolve({ locale }), "/compte/factures", "accountInvoice", {
    noindex: true,
  });
};

/** C05 (ESP-05): one invoice or credit note. The number is read from the URL, the document from the data layer on the client. */
export default async function InvoicePage({ params }: Props) {
  const { locale, number } = await params;
  await resolveLocale(Promise.resolve({ locale }));
  return <Invoice number={number} />;
}

function Invoice({ number }: { number: string }) {
  const t = useTranslations("invoices.detail");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <InvoiceDetailView number={decodeURIComponent(number)} />
      </RequireSession>
    </>
  );
}
