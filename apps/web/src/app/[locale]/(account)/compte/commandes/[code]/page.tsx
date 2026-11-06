import { useTranslations } from "next-intl";
import { OrderDetailView } from "@/components/account/order-detail";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale } from "@/lib/page";

type Props = { params: Promise<{ locale: string; code: string }> };

export const generateMetadata = async ({ params }: Props) => {
  const { locale } = await params;
  return localizedMetadata(Promise.resolve({ locale }), "/compte/commandes", "accountOrder", {
    noindex: true,
  });
};

/** C03 (ESP-04, SUI-05, CMD-08). The code is read from the URL, the order from the data layer on the client. */
export default async function OrderPage({ params }: Props) {
  const { locale, code } = await params;
  await resolveLocale(Promise.resolve({ locale }));
  return <Order code={code} />;
}

function Order({ code }: { code: string }) {
  const t = useTranslations("orders.detail");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <OrderDetailView code={decodeURIComponent(code)} />
      </RequireSession>
    </>
  );
}
