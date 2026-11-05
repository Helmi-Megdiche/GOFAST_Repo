"use client";

import { useState, type ComponentPropsWithRef } from "react";
import { cn } from "../lib/cn";

export type CodeInputProps = Omit<
  ComponentPropsWithRef<"input">,
  "type" | "value" | "onChange" | "maxLength" | "inputMode" | "autoComplete" | "dir"
> & {
  length: number;
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
};

// Arabic-Indic and Eastern Arabic-Indic digits to Latin digits, then digits only.
function digitsOnly(text: string, length: number): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "")
    .slice(0, length);
}

/**
 * One real input for an SMS code (decision 14), drawn as boxes (fg.css .pin). Autofill from the
 * SMS works (autocomplete="one-time-code"), the keypad is numeric and the digits stay
 * left-to-right in Arabic. Spaces, dashes and Arabic-Indic digits in a pasted code are dropped and
 * the value is cut to `length` digits. Give it a label (aria-label or <label for>) and link its
 * error with aria-describedby.
 */
export function CodeInput({
  length,
  value,
  onValueChange,
  invalid,
  className,
  onFocus,
  onBlur,
  ...props
}: CodeInputProps) {
  const [focused, setFocused] = useState(false);
  const current = Math.min(value.length, length - 1);

  return (
    <span dir="ltr" className={cn("relative mx-auto flex w-fit gap-1.5", className)}>
      {Array.from({ length }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "flex h-14 w-11 items-center justify-center rounded-xl border-[1.5px] border-field-border bg-surface font-mono text-2xl font-medium text-ink sm:w-12",
            invalid && "border-danger bg-danger-light",
            focused &&
              index === current &&
              "border-2 border-orange outline-2 outline-offset-2 outline-orange-dark",
          )}
        >
          {value[index] ?? ""}
        </span>
      ))}
      <input
        {...props}
        type="text"
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        // No maxLength: a pasted "482 615" would be cut to "482 61" before digitsOnly keeps 6 digits.
        value={value}
        aria-invalid={invalid ? true : props["aria-invalid"]}
        onChange={(event) => onValueChange(digitsOnly(event.target.value, length))}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        // Covers the boxes: clicks and taps reach the real input, the text itself stays invisible.
        className="absolute inset-0 h-full w-full cursor-text bg-transparent font-mono text-transparent caret-transparent opacity-0"
      />
    </span>
  );
}
