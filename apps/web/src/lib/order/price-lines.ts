import { PRICE_LINES, type PriceLine, type Quote } from "@fastgo/domain";

type QuoteLine = Quote["lines"][PriceLine];

/**
 * The lines of a saved quote that can be shown, in PRICE_LINES order. A quote saved before a line
 * existed (GH-10) lacks it: that line is skipped, never shown as 0, and the total is not touched.
 */
export function presentPriceLines(quote: Quote): [PriceLine, QuoteLine][] {
  const lines = quote.lines as Partial<Record<PriceLine, QuoteLine>>;
  return PRICE_LINES.flatMap((line): [PriceLine, QuoteLine][] => {
    const found = lines[line];
    return found ? [[line, found]] : [];
  });
}
