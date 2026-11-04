import { cn } from "../lib/cn";

/**
 * The logo files are served by the app from /brand (apps/web/public/brand).
 * Intrinsic size 657 x 135 (PNG until the SVG source arrives). Never mirrored in RTL.
 */
export type LogoVariant = "on-dark" | "on-light";

const FILES: Record<LogoVariant, string> = {
  "on-dark": "logo-dark.png",
  "on-light": "logo-light.png",
};

export function Logo({
  variant = "on-light",
  basePath = "/brand",
  alt = "FastGo",
  className,
}: {
  /** on-dark: for navy backgrounds (header, footer). on-light: for light backgrounds. */
  variant?: LogoVariant;
  basePath?: string;
  alt?: string;
  className?: string;
}) {
  return (
    // Plain <img>: packages/ui does not depend on next/image.
    <img
      src={`${basePath}/${FILES[variant]}`}
      width={657}
      height={135}
      alt={alt}
      className={cn("block h-9 w-auto", className)}
    />
  );
}
