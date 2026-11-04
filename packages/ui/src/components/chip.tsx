import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "../lib/cn";

export type ChipProps<T extends ElementType = "button"> = {
  /** Render as a link component (`as={Link}`) for navigation, or leave as a button for filters. */
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/**
 * A pill used as a filter or a side-menu entry (fg.css .chip). The selected state is read from
 * ARIA, so it is also announced: `aria-current="page"` on links, `aria-pressed` on buttons.
 */
export function Chip<T extends ElementType = "button">({ as, className, ...rest }: ChipProps<T>) {
  const Component: ElementType = as ?? "button";
  const defaults = Component === "button" ? { type: "button" } : {};
  return (
    <Component
      {...defaults}
      {...rest}
      className={cn(
        "inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full border border-field-border bg-surface px-3 text-xs font-medium whitespace-nowrap text-ink no-underline",
        "aria-[current=page]:border-navy aria-[current=page]:bg-navy aria-[current=page]:text-white",
        "aria-pressed:border-navy aria-pressed:bg-navy aria-pressed:text-white",
        className,
      )}
    />
  );
}

/** A labelled group of chips stacked on the start side of a page (help topics, legal documents). */
export function ChipNav({
  label,
  className,
  ...props
}: ComponentPropsWithoutRef<"nav"> & { label: string }) {
  return (
    <nav
      {...props}
      aria-label={label}
      className={cn("flex flex-col items-start gap-1", className)}
    />
  );
}
