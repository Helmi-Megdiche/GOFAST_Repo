"use client";

import { useTranslations } from "next-intl";
import {
  Alert,
  Badge,
  Button,
  Card,
  KpiTile,
  Ltr,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@fastgo/ui";
import { DateTime, Money } from "@/components/money";
import { Link } from "@/i18n/navigation";
import { listInvoices, type InvoiceRow } from "@/lib/data/invoices";
import type { InvoiceStatus } from "@/lib/data/invoice-model";
import { useLoader } from "./use-loader";

const STATUS_LOOK: Record<InvoiceStatus, { tone: "success" | "warning"; icon: "check" | "clock" }> =
  {
    paid: { tone: "success", icon: "check" },
    partial: { tone: "warning", icon: "clock" },
    unpaid: { tone: "warning", icon: "clock" },
  };

/** The settlement status of an invoice as a badge (`invoices.status.*`). */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const t = useTranslations("invoices.status");
  return (
    <Badge tone={STATUS_LOOK[status].tone} icon={STATUS_LOOK[status].icon}>
      {t(status)}
    </Badge>
  );
}

/** C04 (ESP-05): the account's invoices and issued credit notes. */
export function InvoicesList() {
  const t = useTranslations("invoices.list");
  const { state, reload } = useLoader((session) => listInvoices(session), "invoices");

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
  const { rows, dueMillimes } = state.data;
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-2">
        <h2 className="text-h4">{t("emptyTitle")}</h2>
        <p className="text-muted">{t("emptyText")}</p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <KpiTile
        className="max-w-sm"
        label={t("dueLabel")}
        value={<Money millimes={dueMillimes} />}
        detail={dueMillimes > 0 ? t("dueSome") : t("dueNone")}
      />
      <InvoicesTable rows={rows} />
    </div>
  );
}

function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const t = useTranslations("invoices.list");
  const e = useTranslations("invoices");
  return (
    <>
      <Table label={t("title")} caption={t("caption")} stacked>
        <THead>
          <Tr>
            <Th>{t("columns.number")}</Th>
            <Th>{t("columns.date")}</Th>
            <Th>{t("columns.orders")}</Th>
            <Th>{t("columns.status")}</Th>
            <Th alignEnd>{t("columns.amount")}</Th>
            <Th>
              <span className="sr-only">{t("columns.action")}</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <Tr key={row.number}>
              <Td label={t("columns.number")}>
                <Ltr mono>{row.number}</Ltr>
              </Td>
              <Td label={t("columns.date")}>
                <DateTime value={row.issuedAt} style="date" />
              </Td>
              <Td label={t("columns.orders")}>
                <span className="flex flex-col gap-0.5">
                  {row.orderCodes.map((code) => (
                    <Ltr key={code} mono>
                      {code}
                    </Ltr>
                  ))}
                </span>
              </Td>
              <Td label={t("columns.status")}>
                {row.status ? (
                  <InvoiceStatusBadge status={row.status} />
                ) : (
                  <span className="flex flex-col items-start gap-1">
                    <Badge tone="neutral">{t("creditNote")}</Badge>
                    <span className="text-xs text-muted">
                      {t.rich("creditNoteOf", {
                        num: () => <Ltr mono>{row.invoiceNumber}</Ltr>,
                      })}
                    </span>
                  </span>
                )}
              </Td>
              <Td alignEnd label={t("columns.amount")}>
                <Money
                  millimes={row.kind === "creditNote" ? -row.totalMillimes : row.totalMillimes}
                />
              </Td>
              <Td>
                <Button
                  as={Link}
                  href={`/compte/factures/${row.number}`}
                  size="sm"
                  variant="secondary"
                  aria-label={t("viewOf", { number: row.number })}
                >
                  {t("view")}
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <p className="text-sm text-muted">{e("example")}</p>
    </>
  );
}
