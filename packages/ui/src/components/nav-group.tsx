import { useId, type ComponentPropsWithoutRef } from "react";
import { cn } from "../lib/cn";

/** A titled group of NavItem in the sidebar (Pilotage, Exploitation...). The title names the group for screen readers. */
export function NavGroup({ label, className, children, ...rest }: { label: string } & Omit<ComponentPropsWithoutRef<"div">, "role" | "aria-labelledby">) {
  const id = useId();
  return (
    <div {...rest} role="group" aria-labelledby={id} className={cn("flex flex-col gap-1", className)}>
      <span id={id} className="px-3 pt-3 text-xs font-semibold tracking-wide text-white/70 uppercase">
        {label}
      </span>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}
