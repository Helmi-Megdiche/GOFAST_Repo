"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@fastgo/ui";

/**
 * Wraps a form's success message. It takes the focus when it appears, so a keyboard or screen
 * reader user lands on the confirmation instead of on a button that has just disappeared.
 */
export function Confirmation({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={cn(
        "rounded-xl outline-offset-2 focus:outline-2 focus:outline-info-dark",
        className,
      )}
    >
      {children}
    </div>
  );
}
