import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "../lib/cn";

export type RadioCardProps = Omit<ComponentPropsWithRef<"input">, "type" | "children" | "title"> & {
  title: ReactNode;
  description?: ReactNode;
  /** Shown at the end of the title row, e.g. a price. Part of the accessible name. */
  end?: ReactNode;
};

/**
 * A radio choice drawn as a card (fg.css .opt): parcel type, service, payment, account type.
 * The whole card is the label; the selected card gets the orange border from the :checked state,
 * so it also works before JavaScript loads.
 */
export function RadioCard({ title, description, end, className, ...props }: RadioCardProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border-[1.5px] border-line bg-surface px-4 py-3.5",
        "has-checked:border-orange has-checked:bg-orange-tint has-checked:ring-1 has-checked:ring-orange",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-orange-dark",
        "has-disabled:cursor-not-allowed has-disabled:opacity-60",
        className,
      )}
    >
      <input
        {...props}
        type="radio"
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-orange"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-3">
          <span className="font-semibold">{title}</span>
          {end ? <span className="shrink-0 font-semibold">{end}</span> : null}
        </span>
        {description ? <span className="text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
