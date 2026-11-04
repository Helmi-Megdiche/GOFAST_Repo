import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type KeyValueItem = { term: ReactNode; value: ReactNode };

/**
 * Label and value pairs (fg.css .kv): label on the start side, value on the end side.
 * Wrap amounts, phone numbers and codes in <Ltr> (or <Money>) before passing them as `value`.
 */
export function KeyValue({ items, className }: { items: KeyValueItem[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm", className)}>
      {items.map((item, index) => (
        <div key={index} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted">{item.term}</dt>
          <dd className="text-end font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
