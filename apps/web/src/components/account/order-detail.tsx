"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  KeyValue,
  Ltr,
  Timeline,
  TimelineItem,
} from "@fastgo/ui";
import type { Locale } from "@fastgo/i18n";
import { CLOSED_ACCOUNT_NAME } from "@/lib/data/order-model";
import { CancelPlacedOrder, CanceledNotice } from "@/components/order/cancel-placed-order";
import { DateTime, Money } from "@/components/money";
import { Link } from "@/i18n/navigation";
import type { OrderDetail, ParcelView } from "@/lib/data/account-orders";
import { ordersPort } from "@/lib/data";
import { FINAL_ORDER_STATES } from "@/lib/data/states";
import { type ProofLevel, formatKg, weightToleranceG } from "@fastgo/domain";
import { OrderStatusBadge } from "./order-status";
import { useLoader } from "./use-loader";

/** Level of proof (ADR-1) to the wording of W15's rule ("order.review.proofs.*"). */
const PROOF_TEXT = {
  codeOrPhotoWithPosition: "codeOrPhotoPosition",
  codeOrSignatureAndPhoto: "codeOrSignaturePhoto",
  codeOrAgentPhoneWithSignatureAndPhoto: "codeElseAgentPhone",
} as const satisfies Record<ProofLevel, string>;

/** C03 (ESP-04, SUI-05, CMD-08): one order of the account, from the event log. */
export function OrderDetailView({ code }: { code: string }) {
  const t = useTranslations("orders.detail");
  const { state, reload } = useLoader(
    (session) => ordersPort().getOrderDetail(session, code),
    code,
  );

  if (state.status === "loading") {
    return (
      <p aria-busy="true" className="text-muted">
        {t("loading")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <Alert tone="error">
        <span className="flex flex-col items-start gap-2">
          {t("error.title")}
          <Button size="sm" variant="secondary" onClick={reload}>
            {t("error.retry")}
          </Button>
        </span>
      </Alert>
    );
  }
  if (state.data.status === "notFound") {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-h4">{t("notFound.title")}</h2>
        <p className="text-muted">{t("notFound.text")}</p>
        <Button as={Link} href="/compte/commandes" variant="secondary">
          {t("back")}
        </Button>
      </Card>
    );
  }
  return <Found order={state.data.order} onChanged={reload} />;
}

function Found({ order, onChanged }: { order: OrderDetail; onChanged: () => void }) {
  const t = useTranslations("orders.detail");
  const o = useTranslations("offers");
  const p = useTranslations("placeholders");
  const review = useTranslations("order.review");
  const account = useTranslations("account");
  const status = useTranslations("orders.status");
  const failure = useTranslations("parcels.failure");
  const final = FINAL_ORDER_STATES.includes(order.status);
  const showEta = !final && order.status !== "pickup_failed";
  const counted = order.parcels.filter((parcel) => parcel.status !== "canceled").length;
  const timeline = [...order.timeline].reverse();
  // R105: a closed account has no name; a missing address is left out, never a blank in the sentence.
  const party = (key: "from" | "to", who: { name: string; address: string | null }) => {
    const name = who.name === CLOSED_ACCOUNT_NAME ? account("closedName") : who.name;
    return who.address
      ? t(key, { name, address: who.address })
      : t(key === "from" ? "fromNoAddress" : "toNoAddress", { name });
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/compte/commandes" className="text-sm font-semibold text-orange-dark">
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Ltr mono className="text-2xl font-semibold text-ink">
            {order.code}
          </Ltr>
          <p className="text-muted">
            {t("summary", { service: o(`${order.service}.name`), count: counted })}
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-start gap-3">
          {order.slipHref ? (
            <Button as="a" href={order.slipHref} download variant="secondary">
              <Icon name="dl" />
              {t("slip")}
            </Button>
          ) : null}
          <CancelPlacedOrder code={order.code} option={order.cancelOption} onChanged={onChanged} />
        </div>
      </div>

      {order.status === "canceled" ? <CanceledNotice fee={order.cancel?.fee ?? null} /> : null}

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {showEta ? (
                <>
                  <p className="text-sm text-muted">{t("eta")}</p>
                  <p className="font-display text-[44px] leading-tight font-bold">
                    {order.etaUtc ? <DateTime value={order.etaUtc} style="time" /> : p("time")}
                  </p>
                </>
              ) : null}
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          {order.lossReported ? <Alert tone="warning">{t("lossReported")}</Alert> : null}
          <Timeline aria-label={t("history")}>
            {timeline.map((entry, index) => (
              <TimelineItem
                key={`${entry.atUtc}-${entry.kind}-${entry.kind === "order" ? entry.status : entry.parcelIndex}`}
                state={index === 0 && !final ? "current" : "done"}
              >
                <b className="font-semibold">
                  {entry.kind === "order"
                    ? status(entry.status)
                    : entry.reason
                      ? t.rich("timeline.deliveryFailed", {
                          n: () => <Ltr>{entry.parcelIndex}</Ltr>,
                          reason: failure(entry.reason),
                        })
                      : t.rich("timeline.deliveryFailedNoReason", {
                          n: () => <Ltr>{entry.parcelIndex}</Ltr>,
                        })}
                </b>
                <br />
                <span className="text-muted">
                  <DateTime value={entry.atUtc} />
                </span>
              </TimelineItem>
            ))}
          </Timeline>
        </Card>

        <div className="flex flex-col gap-4">
          <Card as="section" aria-labelledby="route-title" className="flex flex-col gap-2">
            <h2 id="route-title" className="text-h4">
              {t("route")}
            </h2>
            <p className="text-sm">{party("from", order.sender)}</p>
            <p className="text-sm">{party("to", order.recipient)}</p>
          </Card>
          <Card as="section" aria-labelledby="price-title" className="flex flex-col gap-3">
            <h2 id="price-title" className="text-h4">
              {t("price")}
            </h2>
            <KeyValue
              items={[
                ...order.priceLines.map((line) => ({
                  term: t(`priceLines.${line.kind}`),
                  value:
                    line.millimes === null ? p("price") : <Money millimes={line.millimes} />,
                })),
                { term: <b>{t("total")}</b>, value: <Money millimes={order.totalMillimes} /> },
                { term: t("payment"), value: review(`payments.${order.paymentMode}.title`) },
              ]}
            />
          </Card>
        </div>
      </div>

      <section aria-labelledby="parcels-title" className="flex flex-col gap-3">
        <h2 id="parcels-title" className="text-h4">
          {t("parcels")}
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {order.parcels.map((parcel) => (
            <li key={parcel.index}>
              <ParcelCard parcel={parcel} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ParcelCard({ parcel }: { parcel: ParcelView }) {
  const t = useTranslations("orders.detail");
  const review = useTranslations("order.review");
  const statuses = useTranslations("parcels.status");
  const failure = useTranslations("parcels.failure");
  const locale = useLocale() as Locale;
  const kg = (grams: number) => <Ltr>{t("weightKg", { kg: formatKg(grams, locale) })}</Ltr>;

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-h5 font-semibold">
          {t.rich("parcel", { n: () => <Ltr>{parcel.index}</Ltr> })}
        </h3>
        <Badge tone={parcel.status === "handed_over" ? "success" : "neutral"}>
          {statuses(parcel.status)}
        </Badge>
      </div>
      <KeyValue
        items={[
          { term: t("barcode"), value: <Ltr mono>{parcel.barcode}</Ltr> },
          ...(parcel.attempts > 0
            ? [{ term: t("attempts"), value: <Ltr>{parcel.attempts}</Ltr> }]
            : []),
          ...(parcel.failureReason
            ? [{ term: t("failureReason"), value: failure(parcel.failureReason) }]
            : []),
          { term: t("weightDeclared"), value: kg(parcel.weightDeclaredG) },
          ...(parcel.weightMeasuredG != null
            ? [{ term: t("weightMeasured"), value: kg(parcel.weightMeasuredG) }]
            : []),
        ]}
      />
      {parcel.weightOverTolerance ? (
        <Alert tone="warning">
          {t("weightOver", {
            tolerance: formatKg(weightToleranceG(parcel.weightDeclaredG), locale),
          })}
        </Alert>
      ) : null}
      {parcel.proof ? (
        <div className="flex flex-col gap-0.5 text-sm">
          <p className="font-semibold">{t("proof")}</p>
          <p className="text-muted">{review(`proofs.${PROOF_TEXT[parcel.proof.level]}`)}</p>
          <p className="text-muted">
            {t.rich("proofAt", { date: () => <DateTime value={parcel.proof!.capturedAt} /> })}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
