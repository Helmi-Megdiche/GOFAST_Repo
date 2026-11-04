import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type StepState = "done" | "current" | "todo";

export type Step = { label: ReactNode; state: StepState };

const STATE_STYLES: Record<StepState, string> = {
  done: "border-ink text-ink",
  current: "border-orange text-ink font-semibold",
  todo: "border-line text-muted",
};

export function Stepper({
  steps,
  label,
  stateLabels,
  className,
}: {
  steps: Step[];
  /** Accessible name of the list, e.g. "Order progress". */
  label: string;
  /** Visually hidden text read before each step so the state is not conveyed by color alone. */
  stateLabels: Record<StepState, string>;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={cn("flex gap-1 text-xs", className)}>
      {steps.map((step, index) => (
        <li
          key={index}
          aria-current={step.state === "current" ? "step" : undefined}
          className={cn("min-w-0 flex-1 border-t-4 pt-2", STATE_STYLES[step.state])}
        >
          <span className="sr-only">{stateLabels[step.state]}: </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}
