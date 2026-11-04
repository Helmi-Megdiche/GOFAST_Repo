"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type TabItem = { value: string; label: ReactNode; content: ReactNode };

export function Tabs({
  items,
  label,
  defaultValue,
  className,
}: {
  items: TabItem[];
  /** Accessible name of the tab list. */
  label: string;
  defaultValue?: string;
  className?: string;
}) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(defaultValue ?? items[0]?.value);

  function focusTab(value: string) {
    setSelected(value);
    listRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = items.findIndex((item) => item.value === selected);
    if (index < 0) return;
    // In RTL the visual order is reversed: ArrowLeft moves to the next tab.
    const rtl = listRef.current ? getComputedStyle(listRef.current).direction === "rtl" : false;
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";

    let next: number | null = null;
    if (event.key === forward) next = (index + 1) % items.length;
    else if (event.key === backward) next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;

    event.preventDefault();
    const target = items[next];
    if (target) focusTab(target.value);
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {items.map((item) => {
          const active = item.value === selected;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              data-value={item.value}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(item.value)}
              onKeyDown={onKeyDown}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-3.5 py-2.5 text-sm whitespace-nowrap",
                active
                  ? "border-orange font-semibold text-ink"
                  : "border-transparent font-medium text-muted",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${baseId}-panel-${item.value}`}
          aria-labelledby={`${baseId}-tab-${item.value}`}
          hidden={item.value !== selected}
          tabIndex={0}
          className="pt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
