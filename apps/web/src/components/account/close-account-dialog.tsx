"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Dialog } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { closeAccount, closeBlocker, type CloseBlocker } from "@/lib/data/close-account";
import type { Session } from "@/lib/data/session";

/**
 * R105, T37: closing an individual's account. The dialog reads what blocks the closing when it
 * opens; with a reason it shows the reason, a link to the orders or the invoices, and no close
 * button. Otherwise it says the identity is erased and the invoices are kept (no retention period:
 * D9). The server decides again at confirm time, so a page that went stale shows the new reason.
 */
export function CloseAccountDialog({
  session,
  open,
  onClose,
}: {
  session: Session;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("profile.close");
  const router = useRouter();
  // The reason is read each time the dialog opens, so it is never older than the click.
  const [seen, setSeen] = useState<{ open: boolean; blocker: CloseBlocker | null }>({
    open: false,
    blocker: null,
  });
  const [network, setNetwork] = useState(false);
  const [busy, setBusy] = useState(false);

  if (open !== seen.open) {
    const found = open ? closeBlocker(session) : null;
    setSeen({ open, blocker: found === "notAllowed" ? null : found });
    setNetwork(false);
  }
  const blocker = seen.blocker;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setNetwork(false);
    try {
      const result = await closeAccount(session);
      if (result.status === "closed") {
        // The session ended with the account: go to the public home page.
        router.push("/");
        return;
      }
      if (result.status === "refused") setSeen({ open: true, blocker: result.reason });
    } catch {
      // A network cut or a storage that failed midway: nothing was changed (one write).
      setNetwork(true);
    } finally {
      setBusy(false);
    }
  }

  if (blocker) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={t("refused.title")}
        actions={
          <Button type="submit" autoFocus>
            {t("refused.dismiss")}
          </Button>
        }
      >
        <div className="flex flex-col items-start gap-3">
          <p>{t(`refused.${blocker}`)}</p>
          <Link
            href={blocker === "activeOrder" ? "/compte/commandes" : "/compte/factures"}
            className="font-semibold text-orange-dark underline"
          >
            {blocker === "activeOrder" ? t("refused.seeOrders") : t("refused.seeInvoices")}
          </Link>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("title")}
      actions={
        <>
          <Button type="submit" variant="ghost" autoFocus>
            {t("keep")}
          </Button>
          {/* A button of the dialog's form would close it: the confirm runs first and keeps the dialog open on a refusal. */}
          <Button
            type="button"
            variant="danger"
            aria-disabled={busy || undefined}
            onClick={() => void confirm()}
          >
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p>{t("text")}</p>
        {network ? <Alert tone="error">{t("network")}</Alert> : null}
      </div>
    </Dialog>
  );
}
