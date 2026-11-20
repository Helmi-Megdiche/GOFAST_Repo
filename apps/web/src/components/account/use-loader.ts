"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { AuthRequiredError } from "@/lib/api/errors";
import { signInUrl } from "@/lib/api/unauthorized";
import { useSession } from "@/lib/data/use-session";
import type { Session } from "@/lib/data/session";

export type Loaded<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

/**
 * Loads data of the signed-in account through the data layer (the mock today, the API later).
 * What is shown is derived while rendering from the stored { key, result }: a new `key` (a new URL
 * parameter, a reload request) shows "loading" until its own answer arrives, so an old answer is
 * never shown for a new key. A failed call is "error", and `reload` asks again.
 */
export function useLoader<T>(
  load: (session: Session) => Promise<T>,
  key: string,
): { state: Loaded<T>; reload: () => void } {
  const session = useSession();
  const locale = useLocale();
  const [version, setVersion] = useState(0);
  const [stored, setStored] = useState<{ id: string; scope: string; result: Loaded<T> } | null>(null);
  const scope = `${session?.accountId ?? ""}|${key}`;
  const id = `${scope}|${version}`;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    load(session).then(
      (data) => {
        if (!cancelled) setStored({ id, scope, result: { status: "ready", data } });
      },
      (error: unknown) => {
        if (cancelled) return;
        // The session is gone (401): sign in again and come back to this page (S2).
        if (error instanceof AuthRequiredError) {
          window.location.assign(signInUrl(locale, window.location.pathname));
          return;
        }
        setStored({ id, scope, result: { status: "error" } });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is a module function or an inline closure over `key`: `id` is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  // A reload of the same screen keeps the data it shows until the new answer arrives, so what the
  // screen holds (an open dialog, an alert) is not thrown away. A new key never shows an old answer.
  const state: Loaded<T> =
    stored?.id === id
      ? stored.result
      : stored?.scope === scope && stored.result.status === "ready"
        ? stored.result
        : { status: "loading" };
  return { state, reload };
}
