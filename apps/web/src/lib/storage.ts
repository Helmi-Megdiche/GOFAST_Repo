/**
 * Safe access to localStorage. Storage can be missing (server, private mode), full or blocked:
 * every read and write goes through here and fails quietly, so a page always works.
 * Tests call useMemoryStorage() to get a fresh in-memory storage.
 */
type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

let override: KeyValueStorage | null = null;

function storage(): KeyValueStorage | null {
  if (override) return override;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the page keeps working without persistence.
  }
}

export function removeKey(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
}

/** Test helper. Returns the map so a test can corrupt or inspect what was written. */
export function useMemoryStorage(): Map<string, string> {
  const map = new Map<string, string>();
  override = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
  return map;
}

/** Test helper: a storage whose every call throws. */
export function useBrokenStorage(): void {
  const fail = () => {
    throw new Error("storage unavailable");
  };
  override = { getItem: fail, setItem: fail, removeItem: fail };
}
