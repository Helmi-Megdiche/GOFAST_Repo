import { isIPv6 } from "node:net";

/**
 * The key a per-IP limit counts under. A client owns a whole /64 of IPv6, so counting full addresses
 * would give it 2^64 counters: an IPv6 address is keyed by its /64, an IPv4-mapped one
 * (`::ffff:a.b.c.d`) by the IPv4 address, an IPv4 address as it is.
 */
export function ipKey(ip: string): string {
  const bare = ip.split("%")[0] ?? ip;
  if (!isIPv6(bare)) return bare;
  const groups = expand(bare);
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) {
    const hi = groups[6] as number;
    const lo = groups[7] as number;
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`;
}

/** The eight 16-bit groups of an IPv6 address (`::` expanded, a dotted tail turned into two groups). */
function expand(ip: string): number[] {
  let text = ip;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [, a, b, c, d] = dotted.map(Number) as [number, number, number, number, number];
    text = text.slice(0, dotted.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const zeros = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill("0");
  return [...left, ...zeros, ...right].map((g) => Number.parseInt(g, 16));
}
