import { cn } from "../lib/cn";
import { DIRECTIONAL_ICONS, ICONS, type IconName } from "../icons/icon-map";

export type IconSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<IconSize, number> = { sm: 16, md: 20, lg: 24, xl: 32 };

export type IconProps = {
  name: IconName;
  size?: IconSize;
  /**
   * Mirror the icon under dir="rtl" (arrows, chevrons, navigation).
   * Defaults to true for those icons and false for all others.
   */
  directional?: boolean;
  /** Accessible name. Omit for decorative icons (they are hidden from screen readers). */
  label?: string;
  className?: string;
};

export function Icon({ name, size = "md", directional, label, className }: IconProps) {
  const Glyph = ICONS[name];
  const flip = directional ?? DIRECTIONAL_ICONS.has(name);
  const px = SIZE_PX[size];

  return (
    <Glyph
      width={px}
      height={px}
      strokeWidth={1.75}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      className={cn("shrink-0", flip && "rtl:-scale-x-100", className)}
    />
  );
}
