import { mockDelay } from "./delay";
import type { ServiceCode } from "./services";

export type ZoneResult =
  | { status: "in-zone"; services: ServiceCode[] }
  | { status: "out-of-zone" }
  | { status: "unknown" };

// Fake addresses from the mockup (W05, W17). Any other address is "unknown".
const IN_ZONE = ["rue ibn khaldoun", "avenue habib bourguiba"];
const OUT_OF_ZONE = ["route de sousse"];

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
  if (IN_ZONE.some((known) => text.includes(known))) {
    return { status: "in-zone", services: ["express", "standard"] };
  }
  if (OUT_OF_ZONE.some((known) => text.includes(known))) return { status: "out-of-zone" };
  return { status: "unknown" };
}
