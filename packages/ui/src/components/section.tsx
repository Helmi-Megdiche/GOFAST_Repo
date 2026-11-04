import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "../lib/cn";

/** Centered content column: 1200 px max (fg.css .wrap), 16 px gutters on phones, 24 px from 720 px. */
export function Container({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6", className)} />;
}

export type SectionTone = "default" | "tint" | "dark" | "deep";

const TONES: Record<SectionTone, string> = {
  default: "bg-surface text-ink",
  tint: "bg-page text-ink",
  dark: "bg-inverse text-on-inverse",
  deep: "bg-inverse-deep text-on-inverse",
};

type SectionOwnProps = {
  tone?: SectionTone;
  /** Less vertical space (fg.css .sec.t): 56 px instead of 80 px on desktop. */
  compact?: boolean;
};

export type SectionProps<T extends ElementType = "section"> = SectionOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof SectionOwnProps | "as">;

/**
 * A full-width band of the page (fg.css .sec, .dark, .deep, .bg). Put a <Container> inside.
 * Dark and deep bands switch the focus ring to the orange accent.
 */
export function Section<T extends ElementType = "section">({
  as,
  tone = "default",
  compact,
  className,
  ...rest
}: SectionProps<T>) {
  const Component: ElementType = as ?? "section";
  const inverse = tone === "dark" || tone === "deep";
  return (
    <Component
      {...rest}
      data-inverse={inverse ? "" : undefined}
      className={cn(TONES[tone], compact ? "py-10 sm:py-14" : "py-12 sm:py-20", className)}
    />
  );
}
