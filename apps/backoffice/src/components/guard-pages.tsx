"use client";

import { useTranslations } from "next-intl";
import { Button, Card, PageHeader } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";

/** The placeholder state while the session is read. The server HTML has this and the page's h1 is added once the role is known. */
export function Busy() {
  const t = useTranslations("backoffice.guard");
  return (
    <div className="flex items-center justify-center p-6">
      <p aria-busy="true" role="status" className="text-muted">
        {t("busy")}
      </p>
      <noscript>
        <p>{t("noscript")}</p>
      </noscript>
    </div>
  );
}

/** The service did not answer (the network, a 5xx): say so and offer a retry. */
export function Unavailable({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("backoffice.signIn.errors");
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6">
      <p role="alert" className="text-center">
        {t("unavailable")}
      </p>
      <Button onClick={onRetry}>{t("retry")}</Button>
    </div>
  );
}

/** A screen the role may not open (the API's 403 for the same DR rows): shown in place, the URL does not change. */
export function NoAccess({ landing }: { landing: string }) {
  const t = useTranslations("backoffice.noAccess");
  return (
    <>
      <PageHeader title={t("title")} />
      <Card className="flex flex-col items-start gap-4">
        <p>{t("text")}</p>
        <Link href={landing} className="font-medium text-orange-dark underline">
          {t("link")}
        </Link>
      </Card>
    </>
  );
}
