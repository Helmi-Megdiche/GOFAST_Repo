import {
  availableSlots as availableSlotsWith,
  makeQuote as makeQuoteWith,
  priceLines as priceLinesWith,
  type PriceInput,
  type Quote,
  type Slot,
} from "@fastgo/domain";
import { EXAMPLE_PRICE_TABLE } from "../data/fixtures/pricing";
import { PICKUP_WINDOWS } from "../data/fixtures/slots";

// The rules are in @fastgo/domain and hold no amount and no hours. Until the API serves them, the
// web app binds them to its example tables (GOFAST has not given prices or pickup hours) and to
// crypto.randomUUID for the quote id.

/** The example price lines of an input. */
export const priceLines = (input: PriceInput) => priceLinesWith(input, EXAMPLE_PRICE_TABLE);

/** A quote from the example prices, with a new id unless one is given. */
export const makeQuote = (input: PriceInput, at: number, id: string = crypto.randomUUID()): Quote =>
  makeQuoteWith(input, at, EXAMPLE_PRICE_TABLE, id);

/** The example pickup slots that start after `at`. */
export const availableSlots = (at: number): Slot[] => availableSlotsWith(at, PICKUP_WINDOWS);
