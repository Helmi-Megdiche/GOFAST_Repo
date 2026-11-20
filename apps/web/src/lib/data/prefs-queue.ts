import type { NotificationPrefs } from "./accounts";

/**
 * The notification toggles on a real API (GH-20, 20-d). The API wants all three flags in each PATCH,
 * so a body built from the last saved state would drop a click made before the answer. The queue
 * keeps the wanted state, sends one request at a time, and after each answer sends once more if
 * the wanted state moved on. A failure puts the toggles back to the last saved state.
 */
export function createPrefsQueue(options: {
  initial: NotificationPrefs;
  send: (prefs: NotificationPrefs) => Promise<boolean>;
  /** The wanted state, for the checkboxes. */
  onState: (prefs: NotificationPrefs) => void;
  /** Once per burst: true when the last request was saved, false when one failed. */
  onResult?: (ok: boolean) => void;
}) {
  let onResult = options.onResult ?? (() => {});
  let saved = { ...options.initial };
  let wanted = { ...options.initial };
  let running: Promise<void> | null = null;

  const differs = () =>
    (Object.keys(saved) as (keyof NotificationPrefs)[]).some((k) => saved[k] !== wanted[k]);

  async function run() {
    let ok = true;
    while (differs()) {
      const snapshot = { ...wanted };
      ok = await options.send(snapshot).catch(() => false);
      if (!ok) {
        wanted = { ...saved };
        options.onState(wanted);
        break;
      }
      saved = snapshot;
    }
    running = null;
    onResult(ok);
  }

  return {
    /** Swaps the result callback (a component keeps it current after each render). */
    setOnResult(fn: (ok: boolean) => void) {
      onResult = fn;
    },
    set(key: keyof NotificationPrefs, value: boolean) {
      wanted = { ...wanted, [key]: value };
      options.onState(wanted);
      if (!running && differs()) running = run();
    },
    wanted: () => ({ ...wanted }),
    /** Resolves when nothing is in flight (tests). */
    async idle() {
      while (running) await running;
    },
  };
}
