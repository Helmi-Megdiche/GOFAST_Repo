"use client";

import { useId, type KeyboardEvent, type MouseEvent } from "react";
import { cn } from "../lib/cn";

export type MapPoint = { x: number; y: number };

export type MapPlaceholderProps = {
  /** Pin position, 0 to 1 from the top-left corner, or null before a pin is placed. */
  pin: MapPoint | null;
  /** Called when the pin is placed: by click, or by Enter / Space after moving it with the arrows. */
  onPlace: (point: MapPoint) => void;
  /** Called while the pin moves with the arrow keys (not yet placed). */
  onMove?: (point: MapPoint) => void;
  label: string;
  /** Short keyboard instructions, read by screen readers. */
  instructions: string;
  className?: string;
};

const STEP = 0.05;
const clamp = (value: number) => Math.min(1, Math.max(0, Math.round(value * 100) / 100));

/**
 * Placeholder for the map (CMD-02) until the map provider is chosen. Tokens only, no tiles.
 * Keyboard: focus it, move the pin with the arrow keys, place it with Enter or Space.
 * The map is a picture of the ground, so it is not mirrored in Arabic.
 */
export function MapPlaceholder({
  pin,
  onPlace,
  onMove,
  label,
  instructions,
  className,
}: MapPlaceholderProps) {
  const instructionsId = useId();

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    // Enter and Space also fire a click, with detail 0: place the pin where it is.
    if (event.detail === 0) {
      onPlace(pin ?? { x: 0.5, y: 0.5 });
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    onPlace({
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const from = pin ?? { x: 0.5, y: 0.5 };
    const moves: Record<string, MapPoint> = {
      ArrowLeft: { x: from.x - STEP, y: from.y },
      ArrowRight: { x: from.x + STEP, y: from.y },
      ArrowUp: { x: from.x, y: from.y - STEP },
      ArrowDown: { x: from.x, y: from.y + STEP },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      (onMove ?? onPlace)({ x: clamp(move.x), y: clamp(move.y) });
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        dir="ltr"
        aria-label={label}
        aria-describedby={instructionsId}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="relative block h-[180px] w-full cursor-crosshair overflow-hidden rounded-lg bg-map outline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-dark"
      >
        <svg
          viewBox="0 0 640 180"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block size-full"
        >
          <g className="stroke-map-road" strokeWidth="8" fill="none">
            <path d="M0 60L640 40M0 150L640 170M160 0L190 180M450 0L420 180" />
          </g>
        </svg>
        {pin ? (
          <span
            aria-hidden="true"
            className="absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-orange"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
          />
        ) : null}
      </button>
      <p id={instructionsId} className="text-2xs text-muted">
        {instructions}
      </p>
    </div>
  );
}
