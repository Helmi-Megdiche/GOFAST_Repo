import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Amounts, phone numbers and tracking codes stay left-to-right inside Arabic text
 * (CLAUDE.md). Wrap them in <Ltr>.
 */
export function Ltr({
  children,
  mono,
  className,
}: {
  children: ReactNode;
  /** Use the monospace face (tracking codes). */
  mono?: boolean;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={cn("tabular-nums", mono && "text-code", className)}>
      {children}
    </bdi>
  );
}
