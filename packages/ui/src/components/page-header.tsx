import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** The head of a back-office page (fg.css .ph): the title (the page's h1), a line under it, and actions at the end. */
export function PageHeader({
  title,
  subtitle,
  actions,
  as: Heading = "h1",
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** h1 on a page of its own; h2 when the header sits inside a page that already has its h1 (a showcase). */
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <Heading className="text-d3">{title}</Heading>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
