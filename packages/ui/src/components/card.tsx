import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "../lib/cn";

export type CardTone = "default" | "navy" | "orange" | "flat";

const TONES: Record<CardTone, string> = {
  default: "bg-surface border-line",
  // Secondary text inside a navy card switches to the light-on-dark muted color.
  navy: "bg-inverse border-inverse text-on-inverse [--fg-muted:var(--fg-on-inverse-muted)]",
  orange: "bg-orange-light border-orange-border",
  flat: "bg-page border-transparent",
};

type CardOwnProps = {
  tone?: CardTone;
  /** Remove the inner padding (for tables or media that go edge to edge). */
  flush?: boolean;
};

export type CardProps<T extends ElementType = "div"> = CardOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps | "as">;

export function Card<T extends ElementType = "div">({
  as,
  tone = "default",
  flush,
  className,
  ...rest
}: CardProps<T>) {
  const Component: ElementType = as ?? "div";
  return (
    <Component
      {...rest}
      className={cn(
        "rounded-xl border",
        TONES[tone],
        flush ? "overflow-hidden p-0" : "p-5",
        className,
      )}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line px-5 py-3.5",
        className,
      )}
    />
  );
}

export function CardBody({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={cn("p-5", className)} />;
}
