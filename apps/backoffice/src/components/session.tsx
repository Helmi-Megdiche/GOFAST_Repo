"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createApiClient, fetchMe, signOutStaff, type ApiClient } from "@/lib/api";
import type { Me } from "@/lib/sign-in";

/**
 * The session of the browser, read from GET /v1/me once (the cookie is the authority, the API checks again on every call). `loading`
 * until the first answer; `error` when the network or the service did not answer; `ready` with the person, or null for a 401.
 */
type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; me: Me | null };

type Value = {
  state: State;
  client: ApiClient;
  /** Ask again (the retry button). */
  reload: () => void;
  /** After a sign-in: the answer is the person. */
  setMe: (me: Me | null) => void;
  /** DELETE /v1/sessions, then forget the person. */
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Value | null>(null);

export function SessionProvider({ children, client: given }: { children: ReactNode; client?: ApiClient }) {
  const client = useMemo(() => given ?? createApiClient(), [given]);
  const [state, setState] = useState<State>({ phase: "loading" });
  const live = useRef(true);

  // The state starts as `loading`, so the first read sets nothing before it answers.
  const read = useCallback(() => {
    void fetchMe(client).then((answer) => {
      if (!live.current) return;
      if (answer.status === "me") setState({ phase: "ready", me: answer.me });
      else if (answer.status === "none") setState({ phase: "ready", me: null });
      else setState({ phase: "error" });
    });
  }, [client]);
  const reload = useCallback(() => {
    setState({ phase: "loading" });
    read();
  }, [read]);

  useEffect(() => {
    live.current = true;
    read();
    return () => {
      live.current = false;
    };
  }, [read]);

  const value = useMemo<Value>(
    () => ({
      state,
      client,
      reload,
      setMe: (me) => setState({ phase: "ready", me }),
      signOut: async () => {
        await signOutStaff(client);
        setState({ phase: "ready", me: null });
      },
    }),
    [state, client, reload],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Value {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession needs a SessionProvider");
  return value;
}
