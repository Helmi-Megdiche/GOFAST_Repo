import type { ServiceCode } from "./services";

/** Result of a zone check (R201): which services an address offers, or why none. */
export type ZoneResult =
  | { status: "in-zone"; services: ServiceCode[]; zone: string }
  | { status: "out-of-zone" }
  | { status: "unknown" };
