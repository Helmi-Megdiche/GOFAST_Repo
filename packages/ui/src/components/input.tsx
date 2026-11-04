import type { ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icon";

const CONTROL =
  "w-full min-w-0 rounded-md border border-field-border bg-surface px-3 text-base text-ink " +
  "placeholder:text-placeholder disabled:bg-fill-subtle disabled:text-muted " +
  "aria-invalid:border-danger aria-invalid:bg-danger-light";

export type InputProps = ComponentPropsWithRef<"input"> & { invalid?: boolean };

export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid ? true : props["aria-invalid"]}
      className={cn(CONTROL, "h-11", className)}
    />
  );
}

export type TextareaProps = ComponentPropsWithRef<"textarea"> & { invalid?: boolean };

export function Textarea({ invalid, className, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid ? true : props["aria-invalid"]}
      className={cn(CONTROL, "min-h-24 resize-y py-2.5", className)}
    />
  );
}

export type SelectProps = ComponentPropsWithRef<"select"> & { invalid?: boolean };

export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <span className="relative flex">
      <select
        {...props}
        aria-invalid={invalid ? true : props["aria-invalid"]}
        className={cn(CONTROL, "h-11 appearance-none pe-10", className)}
      >
        {children}
      </select>
      <Icon
        name="cd"
        size="sm"
        className="pointer-events-none absolute inset-y-0 end-3 my-auto text-muted"
      />
    </span>
  );
}
