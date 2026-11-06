"use client";

import { useId, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, type Locale } from "@fastgo/i18n";
import {
  Alert,
  Button,
  Card,
  Chip,
  ChipNav,
  Icon,
  Input,
  Ltr,
  Select,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@fastgo/ui";
import { DateTime, Money } from "@/components/money";
import { Link, useRouter } from "@/i18n/navigation";
import {
  listOrders,
  type OrderFilter,
  type OrdersPage,
  type OrdersQuery,
} from "@/lib/data/account-orders";
import { FINAL_ORDER_STATES } from "@/lib/data/states";
import { ordersQueryToParams, parseOrdersQuery } from "@/lib/account/orders-query";
import { OrderStatusBadge } from "./order-status";
import { useLoader } from "./use-loader";

const FILTERS: OrderFilter[] = ["all", "inProgress", "delivered", "failed"];
const PATH = "/compte/commandes";

type Href = (next: Partial<OrdersQuery>) => { pathname: string; query: Record<string, string> };

/**
 * C02 (ESP-04): search, filter chips, month, pages. The URL is the source of truth
 * (`?statut=&mois=&q=&page=`): it is read on every render and every control only writes it, so a
 * reload or a shared link shows the same list. Changing a filter goes back to page 1.
 */
export function OrdersList() {
  const t = useTranslations("orders.list");
  const params = useSearchParams();
  const router = useRouter();
  const query = parseOrdersQuery(params);
  const { state, reload } = useLoader(
    (session) => listOrders(session, query),
    JSON.stringify(query),
  );
  const searchId = useId();

  const href: Href = (next) => ({
    pathname: PATH,
    query: ordersQueryToParams({ ...query, page: 1, ...next }),
  });
  const go = (next: Partial<OrdersQuery>) => router.replace(href(next), { scroll: false });

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = new FormData(event.currentTarget).get("q");
    go({ q: typeof typed === "string" ? typed.trim() : "" });
  };

  const ready = state.status === "ready" ? state.data : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Keyed by the URL's text: a chip or the back button resets the field to what the URL says. */}
      <form key={query.q} role="search" onSubmit={onSearch} className="flex gap-2">
        <label htmlFor={searchId} className="sr-only">
          {t("searchLabel")}
        </label>
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            id={searchId}
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder={t("searchLabel")}
            autoComplete="off"
            maxLength={60}
            className="ps-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          {t("searchSubmit")}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ChipNav label={t("filtersLabel")} className="flex-row flex-wrap items-center gap-2">
          {FILTERS.map((filter) => (
            <Chip
              key={filter}
              as={Link}
              href={href({ filter })}
              scroll={false}
              aria-current={query.filter === filter ? "page" : undefined}
            >
              {filter === "inProgress"
                ? t("filters.inProgress", { count: ready?.inProgressCount ?? 0 })
                : t(`filters.${filter}`)}
            </Chip>
          ))}
        </ChipNav>
        <MonthSelect
          months={ready?.months ?? []}
          value={query.month}
          onChange={(month) => go({ month })}
        />
      </div>

      {/* A polite live region: the count of the new list is announced once it has arrived. */}
      <p role="status" className="text-sm text-muted">
        {ready && ready.total > 0
          ? t("count", { shown: ready.rows.length, total: ready.total })
          : ""}
      </p>

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
        <Results page={state.data} href={href} />
      )}
    </div>
  );
}

function MonthSelect({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string | null;
  onChange: (month: string | null) => void;
}) {
  const t = useTranslations("orders.list");
  const locale = useLocale() as Locale;
  const id = useId();
  // The month in the URL stays selectable while the list is loading or if it has no order.
  const options = value && !months.includes(value) ? [value, ...months] : months;
  // "YYYY-MM" to the middle of that month, so the Tunis time zone cannot move it to another one.
  const label = (month: string) => {
    const [year, number] = month.split("-").map(Number) as [number, number];
    return formatDate(Date.UTC(year, number - 1, 15, 12), locale, "month");
  };
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {t("monthLabel")}
      </label>
      <Select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-[34px] rounded-full text-xs"
      >
        <option value="">{t("allMonths")}</option>
        {options.map((month) => (
          <option key={month} value={month}>
            {label(month)}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Results({ page, href }: { page: OrdersPage; href: Href }) {
  const t = useTranslations("orders.list");
  const o = useTranslations("offers");

  if (page.accountTotal === 0) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-h4">{t("emptyTitle")}</h2>
        <p className="text-muted">{t("emptyText")}</p>
        <Button as={Link} href="/commander">
          {t("order")}
        </Button>
      </Card>
    );
  }
  if (page.total === 0) return <Alert tone="info">{t("noResults")}</Alert>;

  return (
    <>
      <Table label={t("title")} caption={t("caption")} stacked>
        <THead>
          <Tr>
            <Th>{t("columns.code")}</Th>
            <Th>{t("columns.recipient")}</Th>
            <Th>{t("columns.offer")}</Th>
            <Th>{t("columns.status")}</Th>
            <Th>{t("columns.date")}</Th>
            <Th alignEnd>{t("columns.price")}</Th>
            <Th>
              <span className="sr-only">{t("columns.action")}</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {page.rows.map((row) => {
            const over = FINAL_ORDER_STATES.includes(row.status);
            return (
              <Tr key={row.code}>
                <Td label={t("columns.code")}>
                  <Ltr mono>{row.code}</Ltr>
                </Td>
                <Td label={t("columns.recipient")}>{row.recipientName}</Td>
                <Td label={t("columns.offer")}>{o(`${row.service}.name`)}</Td>
                <Td label={t("columns.status")}>
                  <OrderStatusBadge status={row.status} />
                </Td>
                <Td label={t("columns.date")}>
                  <DateTime value={row.createdAt} style="date" />
                </Td>
                <Td alignEnd label={t("columns.price")}>
                  <Money millimes={row.totalMillimes} />
                </Td>
                <Td>
                  <Button
                    as={Link}
                    href={`/compte/commandes/${row.code}`}
                    size="sm"
                    variant="secondary"
                    aria-label={
                      over ? t("viewOf", { code: row.code }) : t("trackOf", { code: row.code })
                    }
                  >
                    {over ? t("view") : t("track")}
                  </Button>
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
      {page.pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
          {page.page > 1 ? (
            <Button
              as={Link}
              href={href({ page: page.page - 1 })}
              scroll={false}
              variant="secondary"
              size="sm"
            >
              {t("previous")}
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">
            {t("page", { page: page.page, pages: page.pages })}
          </span>
          {page.page < page.pages ? (
            <Button
              as={Link}
              href={href({ page: page.page + 1 })}
              scroll={false}
              variant="secondary"
              size="sm"
            >
              {t("next")}
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
