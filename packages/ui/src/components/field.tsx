import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icon";

type ControlProps = {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  /** Error message. Sets aria-invalid on the control and links the message to it. */
  error?: ReactNode;
  required?: boolean;
  /** Exactly one control: Input, Select or Textarea. Field wires id, label and descriptions. */
  children: ReactElement<ControlProps>;
  className?: string;
};

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  const control = cloneElement(children, {
    id,
    required: required || undefined,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
  });

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden="true" className="ms-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-2xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-2xs font-medium text-danger">
          <Icon name="warn" size="sm" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
