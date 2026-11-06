import { mockDelay } from "./delay";
import type { ServiceCode } from "./services";

export type ZoneResult =
  | { status: "in-zone"; services: ServiceCode[]; zone: string }
  | { status: "out-of-zone" }
  | { status: "unknown" };

// Fake addresses from the mockup (W11, W12, W17). Any other address is "unknown". They offer the
// three services, as on W14; "rue de marseille" offers two, so the disabled Programmée card and
// W05's "Express et Standard" stay tested.
const IN_ZONE = ["rue ibn khaldoun", "avenue habib bourguiba"];
const IN_ZONE_TWO_SERVICES = ["rue de marseille"];
const OUT_OF_ZONE = ["route de sousse"];
const ALL_SERVICES: ServiceCode[] = ["express", "standard", "scheduled"];
// Example zone code, shown on the price line "service and zone" (R204). Not a GOFAST zone.
const EXAMPLE_ZONE = "A";

function normalize(address: string): string {
  return address
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mock of GET /v1/zones/check?address=. */
export async function checkZone(address: string): Promise<ZoneResult> {
  await mockDelay();
  const text = normalize(address);
  if (IN_ZONE_TWO_SERVICES.some((known) => text.includes(known))) {
    return { status: "in-zone", services: ["express", "standard"], zone: EXAMPLE_ZONE };
  }
  if (IN_ZONE.some((known) => text.includes(known))) {
    return { status: "in-zone", services: ALL_SERVICES, zone: EXAMPLE_ZONE };
  }
  if (OUT_OF_ZONE.some((known) => text.includes(known))) return { status: "out-of-zone" };
  return { status: "unknown" };
}

/**
 * Mock of the map pin check (CMD-02). x and y go from 0 to 1 on the placeholder map: a pin inside
 * the central circle is in zone, anywhere else is out of zone. A placed pin is never "unknown".
 */
export async function checkPoint(point: { x: number; y: number }): Promise<ZoneResult> {
  await mockDelay();
  const distance = Math.hypot(point.x - 0.5, point.y - 0.5);
  if (distance <= 0.35) {
    return { status: "in-zone", services: ALL_SERVICES, zone: EXAMPLE_ZONE };
  }
  return { status: "out-of-zone" };
}
