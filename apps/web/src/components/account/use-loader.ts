"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [version, setVersion] = useState(0);
  const [stored, setStored] = useState<{ id: string; result: Loaded<T> } | null>(null);
  const id = `${session?.accountId ?? ""}|${key}|${version}`;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    load(session).then(
      (data) => {
        if (!cancelled) setStored({ id, result: { status: "ready", data } });
      },
      () => {
        if (!cancelled) setStored({ id, result: { status: "error" } });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is a module function or an inline closure over `key`: `id` is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const state: Loaded<T> = stored?.id === id ? stored.result : { status: "loading" };
  return { state, reload };
}
