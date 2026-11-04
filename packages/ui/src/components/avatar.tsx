import { cn } from "../lib/cn";

export type AvatarTone = "neutral" | "orange" | "navy" | "soft";
export type AvatarSize = "md" | "lg";

const TONES: Record<AvatarTone, string> = {
  neutral: "bg-fill text-ink",
  orange: "bg-orange text-navy-deep",
  navy: "bg-navy text-white",
  soft: "bg-orange-light text-orange-dark",
};

const SIZES: Record<AvatarSize, string> = {
  md: "size-9 text-xs",
  lg: "size-14 text-md",
};

/** First letter of up to two words. Works for Latin and Arabic names. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

export function Avatar({
  name,
  tone = "neutral",
  size = "md",
  className,
}: {
  /** Full name: used for the initials and as the accessible name. */
  name: string;
  tone?: AvatarTone;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-full font-semibold",
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  );
}
