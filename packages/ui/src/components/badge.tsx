import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icon";
import type { IconName } from "../icons/icon-map";

export type BadgeTone = "success" | "warning" | "info" | "danger" | "neutral" | "orange";

const TONES: Record<BadgeTone, string> = {
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  info: "bg-info-light text-info-dark",
  danger: "bg-danger-light text-danger",
  neutral: "bg-neutral-light text-ink",
  orange: "bg-orange-light text-orange-dark",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-[9px] py-[3px] text-2xs leading-[18px] font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} className="size-[13px]" /> : null}
      {children}
    </span>
  );
}
