"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Set just before a step navigates to the next one, so only in-flow navigation moves the focus.
let focusOnNextHeading = false;

export function markStepChange() {
  focusOnNextHeading = true;
}

/** The h1 of a step. After a step change the focus moves here, so screen readers hear the new step. */
export function StepHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnNextHeading) {
      focusOnNextHeading = false;
      ref.current?.focus();
    }
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={className ?? "text-d2 outline-none"}>
      {children}
    </h1>
  );
}
