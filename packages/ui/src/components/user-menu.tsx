"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Avatar } from "./avatar";

/**
 * The signed-in person on the back-office sidebar: a button with the name that opens a small panel with the role and whatever the app
 * puts in it (language, sign out). Closes with Escape (the focus goes back to the button) and with a click outside.
 */
export function UserMenu({
  name,
  roleLabel,
  label,
  children,
  className,
}: {
  name: string;
  /** The role in the active language. */
  roleLabel: string;
  /** The accessible name of the panel, translated. */
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div ref={box} className={cn("flex flex-col gap-2", className)}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1 text-start text-sm font-medium text-white hover:bg-navy-3"
      >
        <Avatar name={name} tone="orange" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </button>
      {open ? (
        <div id={id} role="group" aria-label={label} className="flex flex-col gap-3 rounded-lg bg-white/10 p-3 text-sm text-white">
          <p className="text-white/80">{roleLabel}</p>
          {children}
        </div>
      ) : null}
    </div>
  );
}
