import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icon";

export type CheckboxProps = Omit<ComponentPropsWithRef<"input">, "type" | "children"> & {
  label: ReactNode;
  error?: ReactNode;
};

/** A checkbox with its label (fg.css .chk). The whole label is clickable. */
export function Checkbox({ label, error, className, id, ...props }: CheckboxProps) {
  const errorId = id && error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          {...props}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-orange"
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-2xs font-medium text-danger">
          <Icon name="warn" size="sm" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
