import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icon";

/**
 * One expandable question and answer, built on <details> so it works without JavaScript and
 * with the keyboard (Enter or Space on the summary). Stack several for a FAQ.
 */
export function Accordion({
  summary,
  children,
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"details">, "children" | "summary"> & {
  summary: ReactNode;
  children?: ReactNode;
}) {
  return (
    <details
      {...props}
      className={cn("group rounded-xl border border-line bg-surface p-5", className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-h4 marker:hidden [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <Icon
          name="cd"
          size="md"
          className="text-muted transition-transform group-open:rotate-180"
        />
      </summary>
      {children ? <div className="mt-2 text-muted">{children}</div> : null}
    </details>
  );
}
