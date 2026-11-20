import { describe, expect, it } from "vitest";
import { createPrefsQueue } from "./prefs-queue";

/** GH-20 (20-d, supervisor note 2): one PATCH at a time, each built from the latest wanted state. */

const START = { sms: true, email: true, offers: true };

function deferred() {
  let resolve!: (ok: boolean) => void;
  const promise = new Promise<boolean>((r) => (resolve = r));
  return { promise, resolve };
}

describe("notification toggle queue", () => {
  it("two fast toggles end with both saved, sent one at a time", async () => {
    const sent: { sms: boolean; email: boolean; offers: boolean }[] = [];
    const gates = [deferred(), deferred()];
    let inFlight = 0;
    let maxInFlight = 0;
    const results: boolean[] = [];
    const queue = createPrefsQueue({
      initial: START,
      send: async (prefs) => {
        sent.push({ ...prefs });
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const ok = await gates[sent.length - 1]!.promise;
        inFlight -= 1;
        return ok;
      },
      onState: () => undefined,
      onResult: (ok) => results.push(ok),
    });

    queue.set("sms", false);
    queue.set("email", false); // before the first answer
    expect(sent).toEqual([{ sms: false, email: true, offers: true }]);
    gates[0]!.resolve(true);
    await new Promise((r) => setTimeout(r, 0));
    // Not before the first PATCH: a second one carries both changes.
    expect(sent).toEqual([
      { sms: false, email: true, offers: true },
      { sms: false, email: false, offers: true },
    ]);
    gates[1]!.resolve(true);
    await queue.idle();
    expect(maxInFlight).toBe(1);
    expect(results).toEqual([true]);
    expect(queue.wanted()).toEqual({ sms: false, email: false, offers: true });
  });

  it("a toggle back before the answer ends with the original state sent last", async () => {
    const sent: unknown[] = [];
    const queue = createPrefsQueue({
      initial: START,
      send: async (prefs) => (sent.push({ ...prefs }), true),
      onState: () => undefined,
      onResult: () => undefined,
    });
    queue.set("offers", false);
    queue.set("offers", true);
    await queue.idle();
    // The first request was already in flight; the last one carries the final (saved) state.
    expect(sent.at(-1)).toEqual(START);
    expect(queue.wanted()).toEqual(START);
  });

  it("a failure puts the toggles back to the last saved state and reports it", async () => {
    const states: unknown[] = [];
    const results: boolean[] = [];
    const queue = createPrefsQueue({
      initial: START,
      send: async () => false,
      onState: (prefs) => states.push({ ...prefs }),
      onResult: (ok) => results.push(ok),
    });
    queue.set("sms", false);
    await queue.idle();
    expect(results).toEqual([false]);
    expect(queue.wanted()).toEqual(START);
    expect(states.at(-1)).toEqual(START);
  });

  it("a thrown send counts as a failure, and the queue works again afterwards", async () => {
    let calls = 0;
    const queue = createPrefsQueue({
      initial: START,
      send: async () => {
        calls += 1;
        if (calls === 1) throw new Error("cut");
        return true;
      },
      onState: () => undefined,
      onResult: () => undefined,
    });
    queue.set("sms", false);
    await queue.idle();
    queue.set("sms", false);
    await queue.idle();
    expect(calls).toBe(2);
    expect(queue.wanted().sms).toBe(false);
  });
});
