"use client";

import { useTranslations } from "next-intl";
import { Alert, Button, Card, Ltr, Table, TBody, Td, Th, THead, Tr } from "@fastgo/ui";
import { DateTime, Money } from "@/components/money";
import { Link } from "@/i18n/navigation";
import { getDashboard, type Dashboard } from "@/lib/data/account-orders";
import { OrderStatusBadge } from "./order-status";
import { useLoader } from "./use-loader";

/**
 * C01 (ESP-03): the greeting, the orders in progress, the last deliveries and the amount to settle.
 * The two slots of parts B (frequent recipients) and G (install banner) keep their named sections.
 */
export function AccountHomeView() {
  const t = useTranslations("account.home");
  const { state, reload } = useLoader(getDashboard, "home");

  return (
    <div className="flex flex-col gap-6">
      {state.status === "ready" ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-display text-2xl font-bold">
            {t("greeting", { name: state.data.firstName })}
          </p>
          <Button as={Link} href="/commander" size="lg">
            {t("newDelivery")}
          </Button>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <p aria-busy="true" className="text-muted">
          {t("loading")}
        </p>
      ) : state.status === "error" ? (
        <Alert tone="error">
          <span className="flex flex-col items-start gap-2">
            {t("error.title")}
            <Button size="sm" variant="secondary" onClick={reload}>
              {t("error.retry")}
            </Button>
          </span>
        </Alert>
      ) : (
        <Home dashboard={state.data} />
      )}
    </div>
  );
}

function Home({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("account.home");
  const orders = useTranslations("orders.list");
  const o = useTranslations("offers");
  const p = useTranslations("placeholders");

  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section
          data-slot="inProgress"
          aria-labelledby="in-progress-title"
          className="flex flex-col gap-3"
        >
          <h2 id="in-progress-title" className="text-h4">
            {t("slots.inProgress")}
          </h2>
          {dashboard.inProgress.length === 0 ? (
            <p className="text-muted">{t("noneInProgress")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {dashboard.inProgress.map((order) => (
                <li key={order.code}>
                  <Card tone="navy" className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Ltr mono className="text-sm">
                        {order.code}
                      </Ltr>
                      <p className="text-sm opacity-80">
                        {t("orderLine", {
                          count: order.parcelCount,
                          service: o(`${order.service}.name`),
                        })}
                      </p>
                      <p className="text-xs opacity-80">{t("eta")}</p>
                      <p className="font-display text-3xl leading-tight font-bold">
                        {order.etaUtc ? <DateTime value={order.etaUtc} style="time" /> : p("time")}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-3">
                      <OrderStatusBadge status={order.status} />
                      <Button
                        as={Link}
                        href={`/compte/commandes/${order.code}`}
                        variant="inverse"
                        size="sm"
                        aria-label={t("seeDetailOf", { code: order.code })}
                      >
                        {t("seeDetail")}
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          data-slot="lastDeliveries"
          aria-labelledby="last-title"
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="last-title" className="text-h4">
              {t("slots.lastDeliveries")}
            </h2>
            <Link href="/compte/commandes" className="text-sm font-semibold text-orange-dark">
              {t("seeAll")}
            </Link>
          </div>
          {dashboard.lastDeliveries.length === 0 ? (
            <p className="text-muted">{t("noneDelivered")}</p>
          ) : (
            <Table label={t("slots.lastDeliveries")} caption={t("slots.lastDeliveries")} stacked>
              <THead>
                <Tr>
                  <Th>{orders("columns.code")}</Th>
                  <Th>{orders("columns.recipient")}</Th>
                  <Th>{orders("columns.status")}</Th>
                  <Th>{orders("columns.date")}</Th>
                  <Th alignEnd>{orders("columns.price")}</Th>
                </Tr>
              </THead>
              <TBody>
                {dashboard.lastDeliveries.map((row) => (
                  <Tr key={row.code}>
                    <Td label={orders("columns.code")}>
                      <Link href={`/compte/commandes/${row.code}`} className="font-semibold">
                        <Ltr mono>{row.code}</Ltr>
                      </Link>
                    </Td>
                    <Td label={orders("columns.recipient")}>{row.recipientName}</Td>
                    <Td label={orders("columns.status")}>
                      <OrderStatusBadge status={row.status} />
                    </Td>
                    <Td label={orders("columns.date")}>
                      <DateTime value={row.createdAt} style="date" />
                    </Td>
                    <Td alignEnd label={orders("columns.price")}>
                      <Money millimes={row.totalMillimes} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <Card
          as="section"
          data-slot="toSettle"
          aria-labelledby="settle-title"
          className="flex flex-col gap-1"
        >
          <h2 id="settle-title" className="text-h4">
            {t("slots.toSettle")}
          </h2>
          <p className="font-display text-3xl font-bold">
            <Money millimes={dashboard.amountDueMillimes} />
          </p>
          <p className="text-sm text-muted">
            {dashboard.amountDueMillimes > 0 ? t("owed") : t("settled")}
          </p>
        </Card>
        <section data-slot="frequentRecipients" aria-label={t("slots.frequentRecipients")} />
        <section data-slot="installBanner" aria-label={t("slots.installBanner")} />
      </div>
    </div>
  );
}
