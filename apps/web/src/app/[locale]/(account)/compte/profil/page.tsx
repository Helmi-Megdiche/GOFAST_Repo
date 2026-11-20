import { useTranslations } from "next-intl";
import { ProfileView } from "@/components/account/profile-view";
import { RequireSession } from "@/components/account/require-session";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/compte/profil", "accountProfile", { noindex: true });

/** C09 (ESP-02, R105, R902): profile, notifications, language, closing the account. */
export default async function ProfilePage({ params }: PageParams) {
  await resolveLocale(params);
  return <Profile />;
}

function Profile() {
  const t = useTranslations("profile");
  return (
    <>
      <h1 className="text-d2">{t("title")}</h1>
      <RequireSession kind="customer">
        <ProfileView />
      </RequireSession>
    </>
  );
}
