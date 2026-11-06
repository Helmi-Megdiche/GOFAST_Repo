"use client";

import { useTranslations } from "next-intl";
import { Button } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/data/session";

/** Ends the session (and the order draft, see signOut) and goes to the sign-in page. */
export function SignOutButton() {
  const t = useTranslations("account");
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={() => {
        signOut();
        router.push("/connexion");
      }}
    >
      {t("signOut")}
    </Button>
  );
}
