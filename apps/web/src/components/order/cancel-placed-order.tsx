"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Dialog } from "@fastgo/ui";
import { Money } from "@/components/money";
import { Link } from "@/i18n/navigation";
import type { CancelOption } from "@/lib/data/cancel-option";
import { cancelOrder } from "@/lib/data/cancel";
import { NetworkError } from "@/lib/data/orders";
import { getSession } from "@/lib/data/session";
import { CANCEL_FEE_MILLIMES } from "@/lib/order/constants";

type Shown = "free" | "withFee" | "mayHaveFee";
type Problem = "claimOnly" | "notCancellable" | "network" | null;

/**
 * CMD-08 (R212, T06): cancel a placed order, on C03 and on W16. `option` is what the page read;
 * the server decides again at confirm time, so a stale page is corrected, never trusted:
 * - the dialog shows the fee line **before** the client confirms, and `acceptedFee` is true only
 *   when the dialog the client saw had that line;
 * - a fee that appeared since (the driver arrived) re-opens the dialog with the fee line;
 * - after the pickup there is no cancel button, only a claim.
 * `onChanged` asks the page to read the order again.
 */
export function CancelPlacedOrder({
  code,
  option,
  onChanged,
}: {
  code: string;
  option: CancelOption;
  onChanged: () => void;
}) {
  const t = useTranslations("orders.cancel");
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<Shown>("free");
  const [changed, setChanged] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const claim = (
    <Link
      href={{ pathname: "/compte/reclamations/nouvelle", query: { commande: code } }}
      className="font-semibold text-orange-dark underline"
    >
      {t("claim")}
    </Link>
  );

  if (option === "claimOnly" || problem === "claimOnly") {
    return (
      <Alert tone="info" className="max-w-full">
        <span className="flex min-w-0 flex-col gap-1">
          {t("claimOnly")}
          {claim}
        </span>
      </Alert>
    );
  }
  if (problem === "notCancellable")
    return (
      <Alert tone="warning" className="max-w-full">
        {t("notCancellable")}
      </Alert>
    );
  if (option === "none") return null;

  async function confirm() {
    if (busyRef.current) return; // a double click sends one cancel (R202)
    const session = getSession();
    if (!session) return;
    busyRef.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const result = await cancelOrder(session, code, { acceptedFee: shown !== "free" });
      if (result.status === "feeRequired") {
        // The order changed since the page was read: show the fee, ask again.
        setShown(result.fee === "applies" ? "withFee" : "mayHaveFee");
        setChanged(true);
        setOpen(true);
      } else if (result.status === "claimOnly" || result.status === "notCancellable") {
        setProblem(result.status);
      }
      if (result.status !== "feeRequired") onChanged();
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error;
      setProblem("network");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const fee = () => <Money millimes={CANCEL_FEE_MILLIMES} />;
  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <Button
          variant="secondary"
          aria-disabled={busy || undefined}
          onClick={() => {
            if (busy) return;
            setShown(option);
            setChanged(false);
            setProblem(null);
            setOpen(true);
          }}
        >
          {busy ? t("canceling") : t("button")}
        </Button>
        {problem === "network" ? <Alert tone="error">{t("network")}</Alert> : null}
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("title")}
        actions={
          <>
            <Button type="submit" variant="ghost" autoFocus>
              {t("keep")}
            </Button>
            <Button type="submit" variant="danger" onClick={() => void confirm()}>
              {t("confirm")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {changed ? <p className="font-semibold text-ink">{t("changed")}</p> : null}
          <p>{shown === "free" ? t("free") : t.rich(shown, { fee })}</p>
        </div>
      </Dialog>
    </>
  );
}

/** What a canceled order says: the title, and the fee line the cancel recorded (none, applies, backOfficeDecides). */
export function CanceledNotice({ fee }: { fee: "none" | "applies" | "backOfficeDecides" | null }) {
  const t = useTranslations("orders.cancel");
  return (
    <Alert tone="info">
      <span className="flex flex-col gap-1">
        <b>{t("canceled.title")}</b>
        {fee
          ? t.rich(`canceled.${fee}`, { fee: () => <Money millimes={CANCEL_FEE_MILLIMES} /> })
          : null}
      </span>
    </Alert>
  );
}
