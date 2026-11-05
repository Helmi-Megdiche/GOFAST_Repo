import { readJson, writeJson } from "../storage";

/**
 * The mock "server database", kept in localStorage on this device so a reload or the /suivi page
 * still finds what an earlier page created. It stands in for the API: never read it from a
 * component, only from lib/data. Never store a password or a verification code in it.
 */
export function readTable<T>(key: string): Record<string, T> {
  const value = readJson(key);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};
}

export function writeRow<T>(key: string, id: string, row: T): void {
  writeJson(key, { ...readTable<T>(key), [id]: row });
}

/** Test helper: fails the next order answer once, after the order was created (decision 12). */
export const FAIL_NEXT_ORDER_RESPONSE_KEY = "fg.mock.failNextOrderResponse";
