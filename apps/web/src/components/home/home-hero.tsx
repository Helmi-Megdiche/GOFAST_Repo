import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@fastgo/i18n";
import { Container, Timeline, TimelineItem } from "@fastgo/ui";
import { DateTime } from "@/components/money";
import { formatOneDecimal } from "@/lib/format";
import { HOME_EXAMPLE } from "@/lib/data/fixtures/home-example";
import { HeroRouteMap } from "./hero-route-map";
import { HomeTrackingForm } from "./home-tracking-form";
import { QuoteForm } from "./quote-form";

/** Navy hero: headline, "Voir le prix" form, tracking field, and an example of what tracking looks like. */
export function HomeHero() {
  const t = useTranslations("home");
  const locale = useLocale() as Locale;
  const driver = t("example.driver");

  return (
    <section data-inverse className="relative overflow-hidden bg-inverse text-on-inverse">
      <HeroRouteMap />
      <Container className="relative grid gap-6 py-6 md:grid-cols-[minmax(0,500px)_minmax(0,1fr)] md:items-start md:gap-12 md:py-11">
        <div className="min-w-0">
          <h1 className="mb-3 font-display text-[32px] leading-[1.08] font-bold tracking-[-0.025em] italic md:text-[44px] rtl:leading-[1.3] rtl:tracking-normal rtl:not-italic">
            {t("hero.title")}
          </h1>
          <p className="mb-5 text-base text-on-inverse-muted md:text-md">{t("hero.subtitle")}</p>
          <div className="flex flex-col gap-2.5 rounded-2xl bg-surface p-5 text-ink shadow-card">
            <QuoteForm />
            <HomeTrackingForm />
          </div>
        </div>

        <aside
          aria-label={t("example.label")}
          className="w-full rounded-2xl bg-surface p-5 text-ink shadow-card md:mt-6 md:w-[300px] md:justify-self-end"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{t("example.arrivesAround")}</span>
            <span className="rounded-full bg-neutral-light px-2 py-0.5 text-2xs font-semibold">
              {t("example.badge")}
            </span>
          </div>
          <p className="mt-0.5 mb-3.5 font-display text-[42px] leading-[1.1] font-bold">
            <DateTime value={HOME_EXAMPLE.etaUtc} style="time" />
          </p>
          <Timeline>
            <TimelineItem state="done">
              <b className="block font-semibold">{t("example.pickedUp")}</b>
              <span className="text-xs text-muted">
                <DateTime value={HOME_EXAMPLE.pickedUpUtc} style="time" />
              </span>
            </TimelineItem>
            <TimelineItem state="current">
              <b className="block font-semibold">{t("example.enRoute", { driver })}</b>
              <span className="text-xs text-muted">
                {t("example.distance", {
                  distance: formatOneDecimal(HOME_EXAMPLE.distanceKm, locale),
                })}
              </span>
            </TimelineItem>
            <TimelineItem state="todo">
              <b className="block font-medium text-muted">{t("example.proof")}</b>
              <span className="text-xs text-muted">{t("example.proofDetail")}</span>
            </TimelineItem>
          </Timeline>
        </aside>
      </Container>
    </section>
  );
}
