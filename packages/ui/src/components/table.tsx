import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../lib/cn";

export function Table({
  label,
  caption,
  children,
  className,
}: {
  /** Accessible name of the scrollable region. Required so keyboard users can scroll it. */
  label: string;
  /** Visually hidden caption describing the table. */
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    // The region is focusable on purpose: a wide table scrolls horizontally on phones.
    // `relative` makes the region the containing block of the sr-only spans in cells: without it
    // they sit outside the scroll area and widen the whole page on phones.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div role="region" aria-label={label} tabIndex={0} className="relative overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead(props: ComponentPropsWithoutRef<"thead">) {
  return <thead {...props} />;
}

export function TBody({ className, ...props }: ComponentPropsWithoutRef<"tbody">) {
  return <tbody {...props} className={cn("[&>tr:last-child>td]:border-b-0", className)} />;
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
  className,
  ...props
}: ComponentPropsWithoutRef<"td"> & { alignEnd?: boolean }) {
  return (
    <td
      {...props}
      className={cn(
        "border-b border-row-line px-3.5 py-3 align-middle",
        alignEnd ? "text-end" : "text-start",
        className,
      )}
    />
  );
}
