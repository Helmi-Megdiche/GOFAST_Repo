import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Container, Stepper } from "@fastgo/ui";
import { STEPS, type StepId } from "@/lib/order/steps";

/**
 * Stepper and frame of a step page (W11 to W15). The h1 comes from the page, in the server HTML.
 * Without JavaScript the page shows the h1 and one sentence: ordering needs JavaScript.
 */
export function StepFrame({ step, children }: { step: StepId | null; children: ReactNode }) {
  const t = useTranslations("cmd");
  const index = step ? STEPS.indexOf(step) : -1;
  return (
    <Container className="py-5 sm:py-6">
      {/* The mockup's order column is 1080 px (fg.css .cl-c), narrower than the site container. */}
      <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
        {step ? (
          <Stepper
            label={t("stepperLabel")}
            stateLabels={{
              done: t("stepStates.done"),
              current: t("stepStates.current"),
              todo: t("stepStates.todo"),
            }}
            steps={STEPS.map((id, position) => ({
              label: t(`steps.${id}`),
              state: position < index ? "done" : position === index ? "current" : "todo",
            }))}
          />
        ) : null}
        <noscript>
          <p className="rounded-lg bg-warning-light px-3.5 py-3 text-sm text-alert-warning">
            {t("noJs")}
          </p>
        </noscript>
        {children}
      </div>
    </Container>
  );
}
