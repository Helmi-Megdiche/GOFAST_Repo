"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icon";

export type SidebarProps = {
  /** The accessible name of the navigation, translated. */
  label: string;
  /** The logo, shown at the top of the sidebar and in the bar of the phone layout. */
  logo: ReactNode;
  /** The label of the button that opens the drawer below the desktop width. */
  menuLabel: string;
  closeLabel: string;
  /** NavGroup elements. */
  children: ReactNode;
  /** Under the groups: the user menu, sign-out. */
  footer?: ReactNode;
  className?: string;
};

/**
 * The back-office navigation (fg.css .ad-s): a fixed column from the desktop width, a drawer below it, opened by a button in a top bar.
 * It sits on the start side (the right in Arabic) because it uses logical classes only. The drawer closes with Escape (the focus goes
 * back to the button), with its close button and when a link is followed.
 */
export function Sidebar({ label, logo, menuLabel, closeLabel, children, footer, className }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const navId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    // The first link takes the focus when the drawer opens.
    nav.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Following a link closes the drawer. A native listener on the nav: the element has no role of its own to hang a JSX handler on.
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("a")) setOpen(false);
    };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      <header className="flex h-14 items-center justify-between gap-3 bg-navy-deep px-4 md:hidden">
        <span className="flex items-center">{logo}</span>
        <button
          ref={menuButton}
          type="button"
          aria-expanded={open}
          aria-controls={navId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white"
        >
          <Icon name="menu" size="md" />
          {menuLabel}
        </button>
      </header>
      {open ? <div aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" /> : null}
      <nav
        ref={nav}
        id={navId}
        aria-label={label}
        data-open={open ? "true" : "false"}
        className={cn(
          "flex-col gap-2 overflow-y-auto bg-navy-deep p-3 text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:flex-none",
          open ? "fixed inset-y-0 start-0 z-40 flex w-72 max-w-[85vw] md:static md:z-auto md:max-w-none" : "hidden",
          className,
        )}
      >
        <div className="hidden px-2 py-3 md:flex">{logo}</div>
        <div className="flex justify-end md:hidden">
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => {
              setOpen(false);
              menuButton.current?.focus();
            }}
            className="inline-flex size-11 items-center justify-center rounded-lg text-white"
          >
            <Icon name="x" size="md" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-1">{children}</div>
        {footer ? <div className="border-t border-white/15 pt-3">{footer}</div> : null}
      </nav>
    </>
  );
}
