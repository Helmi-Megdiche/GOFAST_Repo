"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { guardDecision } from "@/lib/guard";
import { pathOf } from "@/lib/nav";
import { Busy, Unavailable } from "./guard-pages";
import { useSession } from "./session";

/** /sans-role: a staff account that has no back-office role yet (cahier p.49: it sees nothing). Only a message and sign-out. */
export function NoRole() {
  const t = useTranslations("backoffice");
  const router = useRouter();
  const { state, reload, signOut } = useSession();
  const decision = state.phase === "ready" ? guardDecision(state.me, { kind: "landing" }) : null;
  const action = decision?.action;
  const landing = decision?.action === "landing" ? decision.slug : null;

  useEffect(() => {
    if (action === "signIn") router.replace("/connexion");
    else if (action === "refuse") void signOut().then(() => router.replace({ pathname: "/connexion", query: { refused: "1" } }));
    else if (landing) router.replace(pathOf(landing)); // a role was given since: go to its page
  }, [action, landing, router, signOut]);

  if (state.phase === "error") return <Unavailable onRetry={reload} />;
  if (action !== "noRole") return <Busy />;
  return (
    <Card className="mx-auto flex w-full max-w-[480px] flex-col gap-4 p-6 sm:p-8">
      <h1 className="text-d3">{t("noRole.title")}</h1>
      <p>{t("noRole.text")}</p>
      <Button
        variant="secondary"
        onClick={() => {
          void signOut().then(() => router.replace("/connexion"));
        }}
      >
        {t("shell.signOut")}
      </Button>
    </Card>
  );
}
