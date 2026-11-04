import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

export type ButtonProps<T extends ElementType = "button"> = ButtonOwnProps & {
  /** Render as another element or component, e.g. `as={Link}` for a navigation button. */
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof ButtonOwnProps | "as">;

const BASE =
  "inline-flex items-center justify-center gap-2 border-[1.5px] border-transparent font-semibold whitespace-nowrap no-underline cursor-pointer select-none transition-colors " +
  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-fill disabled:text-muted " +
  "aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-fill aria-disabled:text-muted";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-orange text-navy-deep not-disabled:not-aria-disabled:hover:bg-orange-hover",
  secondary: "bg-surface border-ink text-ink",
  ghost: "bg-surface border-line text-ink",
  danger: "bg-surface border-danger text-danger",
  inverse: "bg-transparent border-white text-white",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs rounded-sm",
  md: "h-11 px-[18px] text-base rounded-md",
  lg: "h-[54px] px-[26px] text-md rounded-lg",
};

export function Button<T extends ElementType = "button">({
  as,
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  ...rest
}: ButtonProps<T>) {
  const Component: ElementType = as ?? "button";
  const defaults = Component === "button" ? { type: "button" } : {};

  return (
    <Component
      {...defaults}
      {...rest}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
    />
  );
}
