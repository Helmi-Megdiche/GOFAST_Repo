import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../lib/cn";

export type TimelineState = "done" | "current" | "todo";

/**
 * A vertical list of dated steps (fg.css .tl): tracking history, how it works, order progress.
 * Dots and the connecting line use logical offsets, so the timeline mirrors in Arabic.
 */
export function Timeline({ className, ...props }: ComponentPropsWithoutRef<"ol">) {
  return <ol {...props} className={cn("flex flex-col", className)} />;
}

const DOT: Record<TimelineState, string> = {
  done: "bg-success",
  current: "bg-orange ring-4 ring-orange-light",
  todo: "bg-field-border",
};

export function TimelineItem({
  state = "done",
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"li"> & { state?: TimelineState }) {
  return (
    <li
      {...props}
      aria-current={state === "current" ? "step" : undefined}
      className={cn("group relative pb-[18px] ps-[26px] text-sm last:pb-0", className)}
    >
      <span
        aria-hidden="true"
        className={cn("absolute start-[5px] top-[6px] size-2.5 rounded-full", DOT[state])}
      />
      <span
        aria-hidden="true"
        className="absolute start-[9.5px] -bottom-1 top-[18px] w-[1.5px] bg-line group-last:hidden"
      />
      {children}
    </li>
  );
}
