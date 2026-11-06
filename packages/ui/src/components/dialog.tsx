"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A modal dialog on the native `<dialog>`: `showModal()` gives the focus handling, the Escape key,
 * the inert page behind it and the focus return to the opener, so there is no `role`, trap or scroll
 * lock to add. The caller owns `open` and gets `onClose` for every way it closes (Escape, a button
 * of the actions form, `open` turning false).
 *
 * `actions` sit in a `<form method="dialog">`: a button of `type="submit"` closes the dialog by
 * itself. Give `autoFocus` to the safe button: it is the one that takes the focus when it opens.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-6 text-ink backdrop:bg-navy-deep/60"
    >
      <h2 id={titleId} className="text-h4">
        {title}
      </h2>
      <div className="mt-2 text-sm text-muted">{children}</div>
      <form method="dialog" className="mt-5 flex flex-wrap justify-end gap-3">
        {actions}
      </form>
    </dialog>
  );
}
