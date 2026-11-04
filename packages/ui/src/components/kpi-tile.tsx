import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type KpiTone = "default" | "alert" | "navy";

const TONES: Record<KpiTone, string> = {
  default: "border-line bg-surface",
  alert: "border-danger-border bg-danger-tint",
  navy: "border-inverse bg-inverse text-on-inverse [--fg-muted:var(--fg-on-inverse-muted)]",
};

export function KpiTile({
  label,
  value,
  detail,
  tone = "default",
  className,
}: {
  label: ReactNode;
  /** Pass amounts and counts wrapped in <Ltr> so they stay left-to-right in Arabic. */
  value: ReactNode;
  detail?: ReactNode;
  tone?: KpiTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-xl border px-[18px] py-4",
        TONES[tone],
        className,
      )}
    >
      <span className="text-xs text-muted">{label}</span>
      <span
        className={cn(
          "font-display text-2xl leading-[1.2] font-bold tracking-[-0.02em] tabular-nums rtl:tracking-normal",
          tone === "alert" && "text-danger",
        )}
      >
        {value}
      </span>
      {detail ? <span className="text-2xs text-muted">{detail}</span> : null}
    </div>
  );
}
