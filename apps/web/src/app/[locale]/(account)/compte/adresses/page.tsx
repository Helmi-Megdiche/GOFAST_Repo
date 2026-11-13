import { useTranslations } from "next-intl";
import { AddressBookView } from "@/components/account/address-book-view";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte/adresses", "accountAddresses", { noindex: true });

/** C08 (ESP-02, CMD-02): saved addresses and recipients. */
export default async function AddressesPage({ params }: PageParams) {
  await resolveLocale(params);
  return <Addresses />;
}

function Addresses() {
  const t = useTranslations("addressBook");
  return (
    <>
      <h1 id="address-book-title" tabIndex={-1} className="text-d2 outline-none">
        {t("title")}
      </h1>
      <RequireSession kind="customer">
        <AddressBookView />
      </RequireSession>
    </>
  );
}
