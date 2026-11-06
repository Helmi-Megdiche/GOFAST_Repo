import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Messages } from "@fastgo/i18n";
import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Chip,
  ChipNav,
  Container,
  Field,
  ICONS,
  Icon,
  Input,
  KeyValue,
  KpiTile,
  Logo,
  Ltr,
  Section as Band,
  Select,
  Stepper,
  TBody,
  THead,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  Timeline,
  TimelineItem,
  Tr,
  type BadgeTone,
  type IconName,
} from "@fastgo/ui";
import { DateTime, Money } from "@/components/money";
import { DialogDemo } from "./dialog-demo";
import { FileAttachDemo } from "./file-attach-demo";
import { CodeInputDemo, GoogleDemo, MapDemo, RadioCardDemo } from "./order-components-demo";
import { devUiFixtures as data } from "@/lib/data/fixtures/dev-ui";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h2 id={`${id}-title`} className="text-d3">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Class names are written out in full so Tailwind can see them.
const SWATCHES = [
  { name: "navy", className: "bg-navy" },
  { name: "navy-deep", className: "bg-navy-deep" },
  { name: "navy-3", className: "bg-navy-3" },
  { name: "orange", className: "bg-orange" },
  { name: "orange-hover", className: "bg-orange-hover" },
  { name: "orange-dark", className: "bg-orange-dark" },
  { name: "orange-light", className: "bg-orange-light" },
  { name: "ink", className: "bg-ink" },
  { name: "muted", className: "bg-muted" },
  { name: "line", className: "bg-line" },
  { name: "page", className: "bg-page" },
  { name: "surface", className: "bg-surface" },
  { name: "info", className: "bg-info" },
  { name: "info-dark", className: "bg-info-dark" },
  { name: "info-light", className: "bg-info-light" },
  { name: "success", className: "bg-success" },
  { name: "success-light", className: "bg-success-light" },
  { name: "warning", className: "bg-warning" },
  { name: "warning-light", className: "bg-warning-light" },
  { name: "danger", className: "bg-danger" },
  { name: "danger-light", className: "bg-danger-light" },
  { name: "inverse", className: "bg-inverse" },
  { name: "inverse-deep", className: "bg-inverse-deep" },
  { name: "accent-on-inverse", className: "bg-accent-on-inverse" },
] as const;

const STATUS_TONE: Record<(typeof data.orders)[number]["status"], BadgeTone> = {
  delivered: "success",
  inProgress: "info",
  pending: "warning",
};

export function UiShowcase() {
  const t = useTranslations("devUi");
  const sectionTitle = (key: keyof Messages["devUi"]["sections"]) => t(`sections.${key}`);
  const icons = Object.keys(ICONS) as IconName[];

  return (
    <>
      <Section id="colors" title={sectionTitle("colors")}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {SWATCHES.map((swatch) => (
            <li key={swatch.name} className="flex flex-col gap-1.5">
              <span className={`h-12 rounded-md border border-line ${swatch.className}`} />
              <Ltr mono className="text-2xs text-muted">
                {swatch.name}
              </Ltr>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="typography" title={sectionTitle("typography")}>
        <div className="flex flex-col gap-4">
          <p className="text-eyebrow">{t("typography.eyebrow")}</p>
          <p className="text-d1">{t("typography.d1")}</p>
          <p className="text-d2">{t("typography.d2")}</p>
          <p className="text-d3">{t("typography.d3")}</p>
          <p className="text-h4">{t("typography.h4")}</p>
          <p className="text-lead">{t("typography.lead")}</p>
          <p className="max-w-prose">{t("typography.body")}</p>
        </div>
      </Section>

      <Section id="buttons" title={sectionTitle("buttons")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            {t("buttons.primary")}
            <Icon name="ar" />
          </Button>
          <Button variant="secondary">{t("buttons.secondary")}</Button>
          <Button variant="ghost">
            <Icon name="gps" />
            {t("buttons.ghost")}
          </Button>
          <Button variant="danger">{t("buttons.danger")}</Button>
          <Button disabled>{t("buttons.disabled")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{t("buttons.small")}</Button>
          <Button size="md">{t("buttons.medium")}</Button>
          <Button size="lg">{t("buttons.large")}</Button>
        </div>
        <div data-inverse className="flex flex-wrap items-center gap-3 rounded-xl bg-inverse p-4">
          <Button variant="inverse">{t("buttons.inverse")}</Button>
          <Button>{t("buttons.primary")}</Button>
        </div>
        <div className="max-w-sm">
          <Button fullWidth>{t("buttons.primary")}</Button>
        </div>
      </Section>

      <Section id="forms" title={sectionTitle("forms")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("forms.departure")} hint={t("forms.addressHint")}>
            <Input placeholder={t("forms.addressPlaceholder")} autoComplete="off" />
          </Field>
          <Field label={t("forms.arrival")} required>
            <Input placeholder={t("forms.addressPlaceholder")} autoComplete="off" />
          </Field>
          <Field label={t("forms.tracking")} error={t("forms.trackingError")}>
            <Input dir="ltr" inputMode="text" autoComplete="off" />
          </Field>
          <Field label={t("forms.service")}>
            <Select defaultValue="express">
              <option value="express">{t("forms.serviceExpress")}</option>
              <option value="standard">{t("forms.serviceStandard")}</option>
            </Select>
          </Field>
          <Field label={t("forms.note")} className="md:col-span-2">
            <Textarea />
          </Field>
        </div>
      </Section>

      <Section id="cards" title={sectionTitle("cards")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Card flush>
            <CardHeader>
              <span className="text-h4">{t("cards.title")}</span>
              <Badge tone="success" icon="check">
                {t("badges.delivered")}
              </Badge>
            </CardHeader>
            <CardBody>
              <p>{t("typography.body")}</p>
            </CardBody>
          </Card>
          <Card tone="navy" data-inverse="">
            <p className="text-h4">{t("cards.title")}</p>
            <p className="text-sm text-muted">{t("typography.lead")}</p>
          </Card>
          <Card tone="orange">
            <p className="text-h4">{t("cards.title")}</p>
          </Card>
          <Card tone="flat">
            <p className="text-h4">{t("cards.title")}</p>
          </Card>
        </div>
      </Section>

      <Section id="badges" title={sectionTitle("badges")}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success" icon="check">
            {t("badges.delivered")}
          </Badge>
          <Badge tone="info" icon="clock">
            {t("badges.inProgress")}
          </Badge>
          <Badge tone="warning" icon="warn">
            {t("badges.pending")}
          </Badge>
          <Badge tone="danger" icon="x">
            {t("badges.failed")}
          </Badge>
          <Badge tone="neutral">{t("badges.draft")}</Badge>
          <Badge tone="orange" icon="bolt">
            {t("forms.serviceExpress")}
          </Badge>
        </div>
      </Section>

      <Section id="alerts" title={sectionTitle("alerts")}>
        <div className="flex flex-col gap-3">
          <Alert tone="info">{t("alerts.info")}</Alert>
          <Alert tone="success">{t("alerts.success")}</Alert>
          <Alert tone="warning">{t("alerts.warning")}</Alert>
          <Alert tone="error">{t("alerts.error")}</Alert>
        </div>
      </Section>

      <Section id="table" title={sectionTitle("table")}>
        <Card flush>
          <Table label={t("table.label")} caption={t("table.label")}>
            <THead>
              <tr>
                <Th>{t("table.number")}</Th>
                <Th>{t("table.status")}</Th>
                <Th alignEnd>{t("table.amount")}</Th>
              </tr>
            </THead>
            <TBody>
              {data.orders.map((order) => (
                <Tr key={order.code}>
                  <Td>
                    <Ltr mono>{order.code}</Ltr>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[order.status]}>{t(`badges.${order.status}`)}</Badge>
                  </Td>
                  <Td alignEnd>
                    <Money millimes={order.amount} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </Section>

      <Section id="stacked-table" title={sectionTitle("stackedTable")}>
        <p className="text-sm text-muted">{t("table.stackedHint")}</p>
        <Card flush>
          <Table stacked label={t("table.stackedLabel")} caption={t("table.stackedLabel")}>
            <THead>
              <tr>
                <Th>{t("table.number")}</Th>
                <Th>{t("table.status")}</Th>
                <Th alignEnd>{t("table.amount")}</Th>
              </tr>
            </THead>
            <TBody>
              {data.orders.map((order) => (
                <Tr key={order.code}>
                  <Td label={t("table.number")}>
                    <Ltr mono>{order.code}</Ltr>
                  </Td>
                  <Td label={t("table.status")}>
                    <Badge tone={STATUS_TONE[order.status]}>{t(`badges.${order.status}`)}</Badge>
                  </Td>
                  <Td alignEnd label={t("table.amount")}>
                    <Money millimes={order.amount} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </Section>

      <Section id="dialog" title={sectionTitle("dialog")}>
        <DialogDemo />
      </Section>

      <Section id="kpi" title={sectionTitle("kpi")}>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <KpiTile
            tone="navy"
            label={t("kpi.receive")}
            value={<Money millimes={data.kpi.receive} />}
          />
          <KpiTile label={t("kpi.collected")} value={<Money millimes={data.kpi.collected} />} />
          <KpiTile label={t("kpi.fees")} value={<Money millimes={data.kpi.fees} />} />
          <KpiTile tone="alert" label={t("kpi.driverStopped")} value={<Ltr>2</Ltr>} />
        </div>
      </Section>

      <Section id="stepper" title={sectionTitle("stepper")}>
        <Stepper
          label={t("stepper.label")}
          stateLabels={{
            done: t("stepper.done"),
            current: t("stepper.current"),
            todo: t("stepper.todo"),
          }}
          steps={[
            { label: t("stepper.sender"), state: "done" },
            { label: t("stepper.recipient"), state: "done" },
            { label: t("stepper.parcel"), state: "current" },
            { label: t("stepper.service"), state: "todo" },
            { label: t("stepper.review"), state: "todo" },
          ]}
        />
      </Section>

      <Section id="tabs" title={sectionTitle("tabs")}>
        <Tabs
          label={t("tabs.label")}
          items={[
            {
              value: "orders",
              label: t("tabs.orders"),
              content: <p>{t("tabs.panel", { name: t("tabs.orders") })}</p>,
            },
            {
              value: "invoices",
              label: t("tabs.invoices"),
              content: <p>{t("tabs.panel", { name: t("tabs.invoices") })}</p>,
            },
            {
              value: "team",
              label: t("tabs.team"),
              content: <p>{t("tabs.panel", { name: t("tabs.team") })}</p>,
            },
          ]}
        />
      </Section>

      <Section id="avatars" title={sectionTitle("avatars")}>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={t("avatars.name")} />
          <Avatar name={t("avatars.name")} tone="orange" />
          <Avatar name={t("avatars.name")} tone="navy" />
          <Avatar name={t("avatars.name")} tone="soft" size="lg" />
        </div>
      </Section>

      <Section id="icons" title={sectionTitle("icons")}>
        <p className="text-sm text-muted">{t("icons.directionalNote")}</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-3">
          {icons.map((name) => (
            <li
              key={name}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-3"
            >
              <Icon name={name} size="lg" />
              <Ltr mono className="text-2xs text-muted">
                {name}
              </Ltr>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="logo" title={sectionTitle("logo")}>
        <div className="grid gap-4 md:grid-cols-2">
          <figure data-inverse className="flex flex-col gap-3 rounded-xl bg-inverse p-5">
            <Logo variant="on-dark" className="h-10" />
            <figcaption className="text-xs text-on-inverse-muted">{t("logo.onDark")}</figcaption>
          </figure>
          <figure className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
            <Logo variant="on-light" className="h-10" />
            <figcaption className="text-xs text-muted">{t("logo.onLight")}</figcaption>
          </figure>
        </div>
      </Section>

      <Section id="formats" title={sectionTitle("formats")}>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <p className="text-h4">{t("formats.money")}</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {data.amounts.map((amount) => (
                <li key={amount}>
                  <Money millimes={amount} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="text-h4">{t("formats.date")}</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              <li>
                <DateTime value={data.instant} style="date" />
              </li>
              <li>
                <DateTime value={data.instant} style="time" />
              </li>
              <li>
                <DateTime value={data.instant} />
              </li>
              <li>
                <Ltr mono>{data.trackingCode}</Ltr>
              </li>
              <li>
                <Ltr>{data.phone}</Ltr>
              </li>
            </ul>
          </Card>
        </div>
      </Section>

      <Section id="layout" title={sectionTitle("layout")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["default", t("more.bandDefault")],
              ["tint", t("more.bandTint")],
              ["dark", t("more.bandDark")],
              ["deep", t("more.bandDeep")],
            ] as const
          ).map(([tone, label]) => (
            <Band key={tone} tone={tone} compact className="rounded-lg border border-line">
              <Container>{label}</Container>
            </Band>
          ))}
        </div>
      </Section>

      <Section id="timeline" title={sectionTitle("timeline")}>
        <Timeline className="max-w-[360px]">
          <TimelineItem state="done">{t("more.timelineDone")}</TimelineItem>
          <TimelineItem state="current">
            <b>{t("more.timelineCurrent")}</b>
          </TimelineItem>
          <TimelineItem state="todo">{t("more.timelineTodo")}</TimelineItem>
        </Timeline>
      </Section>

      <Section id="key-value" title={sectionTitle("keyValue")}>
        <Card className="max-w-[360px]">
          <KeyValue
            items={[
              { term: t("kpi.collected"), value: <Money millimes={1248000} /> },
              { term: t("kpi.fees"), value: <Money millimes={-96000} /> },
            ]}
          />
        </Card>
      </Section>

      <Section id="accordion" title={sectionTitle("accordion")}>
        <div className="flex max-w-[560px] flex-col gap-2">
          <Accordion summary={t("more.accordionQuestion")} open>
            {t("more.accordionAnswer")}
          </Accordion>
          <Accordion summary={t("more.accordionQuestion")}>{t("more.accordionAnswer")}</Accordion>
        </div>
      </Section>

      <Section id="chips" title={sectionTitle("chips")}>
        <ChipNav label={t("more.chipsLabel")}>
          <Chip aria-pressed="true">{t("more.chipOn")}</Chip>
          <Chip aria-pressed="false">{t("more.chipOff")}</Chip>
        </ChipNav>
      </Section>

      <Section id="checkbox" title={sectionTitle("checkbox")}>
        <div className="flex max-w-[360px] flex-col gap-3">
          <Checkbox label={t("more.checkboxLabel")} />
          <Checkbox label={t("more.checkboxLabel")} defaultChecked />
        </div>
      </Section>

      <Section id="file-attach" title={sectionTitle("fileAttach")}>
        <FileAttachDemo />
      </Section>

      <Section id="radio-card" title={sectionTitle("radioCard")}>
        <RadioCardDemo />
      </Section>

      <Section id="code-input" title={sectionTitle("codeInput")}>
        <CodeInputDemo />
      </Section>

      <Section id="map" title={sectionTitle("map")}>
        <MapDemo />
      </Section>

      <Section id="google" title={sectionTitle("google")}>
        <GoogleDemo />
      </Section>
    </>
  );
}
