"use client";

import { useTranslations } from "next-intl";
import { Button } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { sharedAuthPort } from "@/lib/data";

/** Ends the session (and the order draft, see signOut) and goes to the sign-in page. */
export function SignOutButton() {
  const t = useTranslations("account");
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={() => {
        // The copy goes even when the server call fails (see the adapter), so the redirect is safe.
        void sharedAuthPort()
          .signOut()
          .then(() => router.push("/connexion"));
      }}
    >
      {t("signOut")}
    </Button>
  );
}
