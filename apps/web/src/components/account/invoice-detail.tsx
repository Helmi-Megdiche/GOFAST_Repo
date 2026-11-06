"use client";

import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Card,
  Icon,
  KeyValue,
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
import {
  getInvoice,
  type CreditNoteDetail,
  type InvoiceDetail,
  type InvoiceLineView,
} from "@/lib/data/invoices";
import { InvoiceStatusBadge } from "./invoices-list";
import { useLoader } from "./use-loader";

/** C05 (ESP-05): one invoice or credit note of the account. The buyer is read from the snapshot only. */
export function InvoiceDetailView({ number }: { number: string }) {
  const t = useTranslations("invoices.detail");
  const { state, reload } = useLoader((session) => getInvoice(session, number), number);

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
  const result = state.data;
  if (result.status === "notFound") {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-h4">{t("notFound.title")}</h2>
        <p className="text-muted">{t("notFound.text")}</p>
        <Button as={Link} href="/compte/factures" variant="secondary">
          {t("back")}
        </Button>
      </Card>
    );
  }
  return result.kind === "invoice" ? (
    <InvoiceView invoice={result.invoice} />
  ) : (
    <CreditNoteView note={result.creditNote} />
  );
}

function BackLink() {
  const t = useTranslations("invoices.detail");
  return (
    <Link href="/compte/factures" className="text-sm font-semibold text-orange-dark">
      {t("back")}
    </Link>
  );
}

function InvoiceView({ invoice }: { invoice: InvoiceDetail }) {
  const t = useTranslations("invoices.detail");
  const l = useTranslations("invoices.detail.lines");
  const o = useTranslations("offers");
  const p = useTranslations("placeholders");
  const e = useTranslations("invoices");
  const lineLabel = (line: InvoiceLineView): string => {
    if (line.kind === "returnFee") return l("returnFee", { index: line.parcelIndex ?? 1 });
    if (line.kind === "cancelFee") return l("cancelFee");
    const service = o(`${line.service}.name`);
    return line.parcelIndex === null
      ? l("freight", { service })
      : l("freightParcel", { service, index: line.parcelIndex });
  };
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-2xl font-semibold text-ink">
            {t.rich("heading", { num: () => <Ltr mono>{invoice.number}</Ltr> })}
          </h2>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button as="a" href={invoice.pdfHref} download variant="secondary">
            <Icon name="dl" />
            {t("downloadInvoice")}
          </Button>
          {invoice.receiptHref ? (
            <Button as="a" href={invoice.receiptHref} download variant="secondary">
              <Icon name="dl" />
              {t("downloadReceipt")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="flex min-w-0 flex-col gap-6">
          <KeyValue
            items={[
              { term: t("issuedOn"), value: <DateTime value={invoice.issuedAt} style="date" /> },
              {
                term: t("issuer"),
                value: (
                  <span className="flex flex-col items-end">
                    {t("issuerName")}
                    <span>{p("address")}</span>
                    <span>{t("issuerTaxId", { value: p("taxId") })}</span>
                  </span>
                ),
              },
              {
                term: t("buyer"),
                value: (
                  <span className="flex flex-col items-end">
                    {invoice.buyer.name}
                    <span>{invoice.buyer.address}</span>
                    {invoice.buyer.taxNumber ? (
                      <span>
                        {t.rich("buyerTaxId", { num: () => <Ltr>{invoice.buyer.taxNumber}</Ltr> })}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                term: t("orders"),
                value: (
                  <span className="flex flex-col items-end">
                    {invoice.orderCodes.map((code) => (
                      <Link
                        key={code}
                        href={`/compte/commandes/${code}`}
                        className="text-orange-dark"
                      >
                        <Ltr mono>{code}</Ltr>
                      </Link>
                    ))}
                  </span>
                ),
              },
            ]}
          />

          <Table label={l("caption")} caption={l("caption")} stacked>
            <THead>
              <Tr>
                <Th>{l("service")}</Th>
                <Th alignEnd>{l("amount")}</Th>
              </Tr>
            </THead>
            <TBody>
              {invoice.lines.map((line, index) => (
                <Tr key={index}>
                  <Td label={l("service")}>
                    <span className="flex flex-col">
                      {lineLabel(line)}
                      <Ltr mono className="text-xs text-muted">
                        {line.orderCode}
                      </Ltr>
                    </span>
                  </Td>
                  <Td alignEnd label={l("amount")}>
                    <Money millimes={line.netMillimes} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>

          <KeyValue
            items={[
              { term: t("totals.subtotal"), value: <Money millimes={invoice.netMillimes} /> },
              {
                term: t("totals.vat"),
                value:
                  invoice.vatMillimes === null ? (
                    <span>{p("vat")}</span>
                  ) : (
                    <Money millimes={invoice.vatMillimes} />
                  ),
              },
              { term: t("totals.stamp"), value: <Money millimes={invoice.stampMillimes} /> },
              {
                term: <strong className="text-ink">{t("totals.total")}</strong>,
                value: (
                  <strong>
                    <Money millimes={invoice.totalMillimes} />
                  </strong>
                ),
              },
            ]}
          />
          <p className="text-sm text-muted">{e("example")}</p>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <KeyValue
              items={[
                { term: t("status"), value: <InvoiceStatusBadge status={invoice.status} /> },
                ...(invoice.paidAt
                  ? [{ term: t("paidOn"), value: <DateTime value={invoice.paidAt} style="date" /> }]
                  : []),
                ...(invoice.dueMillimes > 0
                  ? [{ term: t("due"), value: <Money millimes={invoice.dueMillimes} /> }]
                  : []),
              ]}
            />
            {invoice.receiptHref ? <p className="text-sm text-muted">{t("receipt")}</p> : null}
          </Card>

          {invoice.ttn ? (
            <Card className="flex flex-col gap-2">
              <p className="font-medium">{t("ttn.registered")}</p>
              <p className="text-sm">
                {t.rich("ttn.id", { num: () => <Ltr>{invoice.ttn?.id}</Ltr> })}
              </p>
              <div
                role="img"
                aria-label={t("ttn.qr")}
                className="flex size-28 items-center justify-center rounded-md border border-line text-center text-2xs text-muted"
              >
                {t("ttn.qr")}
              </div>
            </Card>
          ) : null}

          {invoice.creditNotes.length > 0 ? (
            <Card className="flex flex-col gap-2">
              <h3 className="text-h5">{t("creditNotes.title")}</h3>
              <ul className="flex flex-col gap-2">
                {invoice.creditNotes.map((note) => (
                  <li key={note.number} className="flex flex-col gap-0.5 text-sm">
                    <Link href={`/compte/factures/${note.number}`} className="text-orange-dark">
                      {t.rich("creditNotes.item", {
                        num: () => <Ltr mono>{note.number}</Ltr>,
                      })}
                    </Link>
                    <KeyValue
                      items={[
                        {
                          term: t("creditNotes.amount"),
                          value: <Money millimes={-note.totalMillimes} />,
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Button
            as={Link}
            href={{ pathname: "/compte/reclamations/nouvelle", query: { facture: invoice.number } }}
            variant="secondary"
          >
            {t("contest")}
          </Button>
          <p className="text-xs text-muted">{t("exampleFiles")}</p>
        </div>
      </div>
    </div>
  );
}

function CreditNoteView({ note }: { note: CreditNoteDetail }) {
  const t = useTranslations("invoices.creditNote");
  const d = useTranslations("invoices.detail");
  const e = useTranslations("invoices");
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-2xl font-semibold text-ink">
          {t.rich("heading", { num: () => <Ltr mono>{note.number}</Ltr> })}
        </h2>
        <Button as="a" href={note.pdfHref} download variant="secondary">
          <Icon name="dl" />
          {t("download")}
        </Button>
      </div>
      <Card className="flex max-w-xl flex-col gap-4">
        <KeyValue
          items={[
            { term: t("issuedOn"), value: <DateTime value={note.issuedAt} style="date" /> },
            { term: t("amount"), value: <Money millimes={-note.totalMillimes} /> },
          ]}
        />
        <Link href={`/compte/factures/${note.invoiceNumber}`} className="text-orange-dark">
          {t.rich("of", { num: () => <Ltr mono>{note.invoiceNumber}</Ltr> })}
        </Link>
        <p className="text-sm text-muted">{e("example")}</p>
        <p className="text-xs text-muted">{d("exampleFiles")}</p>
      </Card>
    </div>
  );
}
