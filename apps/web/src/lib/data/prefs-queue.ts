import type { NotificationPrefs } from "./accounts";

/** What one request came to: saved, refused, or the answer was lost (the server may have saved it). */
export type PrefsSendResult = boolean | "unknown";

const same = (a: NotificationPrefs, b: NotificationPrefs) =>
  (Object.keys(a) as (keyof NotificationPrefs)[]).every((k) => a[k] === b[k]);

/**
 * The notification toggles on a real API (GH-20, 20-d). The API wants all three flags in each PATCH,
 * so a body built from the last saved state would drop a click made before the answer. The queue
 * keeps the wanted state, sends one request at a time, and after each answer sends once more if
 * the wanted state moved on. A refusal puts the toggles back to the last saved state. A lost
 * answer (RV-18) is not a refusal: the server may have saved it, so the queue asks `refresh` and
 * shows what the server says.
 */
export function createPrefsQueue(options: {
  initial: NotificationPrefs;
  send: (prefs: NotificationPrefs) => Promise<PrefsSendResult>;
  /** What the server holds now. Asked after a lost answer. */
  refresh?: () => Promise<NotificationPrefs>;
  /** The wanted state, for the checkboxes. */
  onState: (prefs: NotificationPrefs) => void;
  /** Once per burst: true when the last request was saved, false when one failed. */
  onResult?: (ok: boolean) => void;
}) {
  let onResult = options.onResult ?? (() => {});
  let saved = { ...options.initial };
  let wanted = { ...options.initial };
  let running: Promise<void> | null = null;

  async function run() {
    let ok = true;
    while (!same(saved, wanted)) {
      const snapshot = { ...wanted };
      const result: PrefsSendResult = await options.send(snapshot).catch(() => false);
      if (result === true) {
        saved = snapshot;
        ok = true;
        continue;
      }
      let known: NotificationPrefs | null = null;
      if (result === "unknown" && options.refresh) {
        known = await options.refresh().catch(() => null);
      }
      if (known) {
        // The server's word replaces both copies. A click made while we asked is kept.
        const moved = !same(wanted, snapshot);
        saved = { ...known };
        if (!moved) wanted = { ...known };
        options.onState(wanted);
        ok = same(known, snapshot);
        continue;
      }
      ok = false;
      wanted = { ...saved };
      options.onState(wanted);
      break;
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
      if (!running && !same(saved, wanted)) running = run();
    },
    wanted: () => ({ ...wanted }),
    /** Resolves when nothing is in flight (tests). */
    async idle() {
      while (running) await running;
    },
  };
}
