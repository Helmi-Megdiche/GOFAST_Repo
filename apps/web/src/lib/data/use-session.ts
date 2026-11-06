"use client";

import { useMemo, useSyncExternalStore } from "react";
import { readJson } from "../storage";
import { getSession, SESSION_KEY, type Session } from "./session";

const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};

// A string snapshot: React compares it by value, so the session object is not rebuilt each render.
const snapshot = () => JSON.stringify(readJson(SESSION_KEY) ?? null);

/**
 * The browser session. `undefined` on the server and during hydration (the session lives in
 * localStorage), then the session or null. Pages decide what to show only once it is defined.
 */
export function useSession(): Session | null | undefined {
  const raw = useSyncExternalStore(subscribe, snapshot, () => undefined);
  return useMemo(() => (raw === undefined ? undefined : getSession()), [raw]);
}
