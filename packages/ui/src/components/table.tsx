import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../lib/cn";

// Stacked mode: the region is a container (`@container`, `group/table`) and below 600 px of its
// own width the table, its rows and cells turn into block cards. The variants are written out in
// full so Tailwind can see them.

export function Table({
  label,
  caption,
  children,
  className,
  stacked,
}: {
  /** Accessible name of the scrollable region. Required so keyboard users can scroll it. */
  label: string;
  /** Visually hidden caption describing the table. */
  caption?: string;
  children: ReactNode;
  className?: string;
  /** Below 600 px of width the rows become cards and each `Td label` names its column. */
  stacked?: boolean;
}) {
  return (
    // The region is focusable on purpose: a wide table scrolls horizontally on phones.
    // `relative` makes the region the containing block of the sr-only spans in cells: without it
    // they sit outside the scroll area and widen the whole page on phones.
    <div
      role="region"
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      data-stacked={stacked ? "" : undefined}
      className="group/table relative overflow-x-auto @container"
    >
      <table
        className={cn(
          "w-full border-collapse text-sm",
          "group-data-stacked/table:@max-[600px]:block",
          className,
        )}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: ComponentPropsWithoutRef<"thead">) {
  // In stacked mode the headers stay in the DOM (screen readers) but are not drawn.
  return (
    <thead {...props} className={cn("group-data-stacked/table:@max-[600px]:sr-only", className)} />
  );
}

export function TBody({ className, ...props }: ComponentPropsWithoutRef<"tbody">) {
  return (
    <tbody
      {...props}
      className={cn(
        "[&>tr:last-child>td]:border-b-0",
        "group-data-stacked/table:@max-[600px]:block",
        className,
      )}
    />
  );
}

export type RowTone = "default" | "highlight" | "error";

export function Tr({
  tone = "default",
  className,
  ...props
}: ComponentPropsWithoutRef<"tr"> & { tone?: RowTone }) {
  return (
    <tr
      {...props}
      className={cn(
        tone === "highlight" && "[&>td]:bg-orange-light",
        tone === "error" && "[&>td]:bg-danger-light",
        "group-data-stacked/table:@max-[600px]:mb-3 group-data-stacked/table:@max-[600px]:block group-data-stacked/table:@max-[600px]:overflow-hidden group-data-stacked/table:@max-[600px]:rounded-md group-data-stacked/table:@max-[600px]:border group-data-stacked/table:@max-[600px]:border-line",
        className,
      )}
    />
  );
}

export function Th({
  alignEnd,
  className,
  ...props
}: ComponentPropsWithoutRef<"th"> & { alignEnd?: boolean }) {
  return (
    <th
      scope="col"
      {...props}
      className={cn(
        "border-b border-line bg-fill-subtle px-3.5 py-2.5 text-2xs font-semibold whitespace-nowrap text-muted",
        alignEnd ? "text-end" : "text-start",
        className,
      )}
    />
  );
}

export function Td({
  alignEnd,
  label,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"td"> & {
  alignEnd?: boolean;
  /** Column name, shown only in a stacked table below 600 px (the real header is hidden there). */
  label?: string;
}) {
  return (
    <td
      {...props}
      className={cn(
        "border-b border-row-line px-3.5 py-3 align-middle",
        alignEnd ? "text-end" : "text-start",
        "group-data-stacked/table:@max-[600px]:flex group-data-stacked/table:@max-[600px]:items-center group-data-stacked/table:@max-[600px]:justify-between group-data-stacked/table:@max-[600px]:gap-3 group-data-stacked/table:@max-[600px]:text-end",
        className,
      )}
    >
      {label ? (
        // aria-hidden: the hidden header already names the column for assistive technology.
        <span aria-hidden="true" className="text-2xs font-semibold text-muted @[600px]:hidden">
          {label}
        </span>
      ) : null}
      {children}
    </td>
  );
}
