import { useTranslations } from "next-intl";

/** Placeholder while the draft loads (also what a visitor without JavaScript sees under the h1). */
export function StepBusy() {
  const t = useTranslations("cmd");
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p className="sr-only" role="status">
        {t("loading")}
      </p>
      <div aria-hidden="true" className="h-40 rounded-xl border border-line bg-surface" />
    </div>
  );
}
