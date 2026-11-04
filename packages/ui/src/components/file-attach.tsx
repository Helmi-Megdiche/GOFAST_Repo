"use client";

import { useId, useRef, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Icon } from "./icon";

export type FileAttachProps = {
  /** Button text, e.g. "Add an attachment (5 MB)". */
  label: ReactNode;
  /** Accessible name of the remove button. */
  removeLabel: string;
  value: File | null;
  onChange: (file: File | null) => void;
  /** Validation message. The size or type rule itself is decided by the form, not here. */
  error?: ReactNode;
  accept?: string;
  name?: string;
  className?: string;
};

/**
 * One optional file. The button opens the system picker; the chosen file name is shown with a
 * remove button. The picker is a real <input type="file"> kept off screen, so the button is the
 * only control a keyboard user reaches.
 */
export function FileAttach({
  label,
  removeLabel,
  value,
  onChange,
  error,
  accept,
  name,
  className,
}: FileAttachProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
          // Allow choosing the same file again after removing it.
          event.target.value = "";
        }}
      />
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-fill-subtle px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="file" size="sm" className="text-muted" />
            <bdi dir="ltr" className="truncate">
              {value.name}
            </bdi>
          </span>
          <button
            type="button"
            aria-label={removeLabel}
            onClick={() => onChange(null)}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted hover:text-ink"
          >
            <Icon name="x" size="sm" />
          </button>
        </div>
      ) : (
        <Button
          variant="ghost"
          aria-describedby={error ? errorId : undefined}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="ul" size="sm" />
          {label}
        </Button>
      )}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-2xs font-medium text-danger"
        >
          <Icon name="warn" size="sm" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
