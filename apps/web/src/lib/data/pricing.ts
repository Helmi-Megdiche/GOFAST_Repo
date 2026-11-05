import { makeQuote, type PriceInput, type Quote } from "../order/pricing";
import { mockDelay } from "./delay";
import type { ZoneResult } from "./zones";

export type QuoteResult =
  { status: "ok"; quote: Quote } | { status: "outOfZone" } | { status: "addressUnconfirmed" };

/**
 * Mock of POST /v1/quotes. R201: an out-of-zone address is refused before any price is
 * calculated, and an address that is not confirmed ("unknown") never gets a price either.
 */
export async function getQuote(
  input: Omit<PriceInput, "zone">,
  departure: ZoneResult | null,
  arrival: ZoneResult | null,
  at: number,
): Promise<QuoteResult> {
  await mockDelay(0);
  if (departure?.status === "out-of-zone" || arrival?.status === "out-of-zone")
    return { status: "outOfZone" };
  if (departure?.status !== "in-zone" || arrival?.status !== "in-zone")
    return { status: "addressUnconfirmed" };
  return { status: "ok", quote: makeQuote({ ...input, zone: arrival.zone }, at) };
}
