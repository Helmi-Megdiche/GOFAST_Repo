import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { OrdersList } from "@/components/account/orders-list";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte/commandes", "accountOrders", { noindex: true });

/** C02 (ESP-04): the filters are read from the URL on the client, inside Suspense. */
export default async function OrdersPage({ params }: PageParams) {
  await resolveLocale(params);
  return <Orders />;
}

function Orders() {
  const t = useTranslations("orders.list");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <Suspense>
          <OrdersList />
        </Suspense>
      </RequireSession>
    </>
  );
}
