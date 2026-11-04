import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icon";
import type { IconName } from "../icons/icon-map";

export type AlertTone = "info" | "success" | "warning" | "error";

const TONES: Record<AlertTone, { box: string; icon: IconName }> = {
  info: { box: "bg-info-light text-alert-info", icon: "info" },
  success: { box: "bg-success-light text-alert-success", icon: "ok" },
  warning: { box: "bg-warning-light text-alert-warning", icon: "warn" },
  error: { box: "bg-danger-light text-alert-error", icon: "err" },
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm", box, className)}
    >
      <Icon name={icon} className="mt-px" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
