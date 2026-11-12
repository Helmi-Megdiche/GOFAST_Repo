/**
 * A 106-bit non-cryptographic digest of a text, as 27 hex characters (two cyrb53 passes with different
 * seeds). The mock stores it instead of a request's text, where only equality is ever checked, so a
 * stored copy holds no name or phone to erase (R105). The real API stores a real hash.
 */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function digest(text: string): string {
  return [cyrb53(text, 0), cyrb53(text, 1)].map((n) => n.toString(16).padStart(14, "0")).join("");
}
