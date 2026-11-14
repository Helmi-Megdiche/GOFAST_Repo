import { decideQuote, type PriceInput, type QuoteResult, type ZoneResult } from "@fastgo/domain";
import { mockDelay } from "./delay";
import { EXAMPLE_PRICE_TABLE } from "./fixtures/pricing";

/**
 * Mock of POST /v1/quotes. The R201 decision (out of zone, address not confirmed) is a rule in
 * @fastgo/domain; this file only adds the fake network delay, the example prices and the id maker.
 */
export async function getQuote(
  input: Omit<PriceInput, "zone">,
  departure: ZoneResult | null,
  arrival: ZoneResult | null,
  at: number,
): Promise<QuoteResult> {
  await mockDelay(0);
  return decideQuote(input, departure, arrival, at, EXAMPLE_PRICE_TABLE, () => crypto.randomUUID());
}
