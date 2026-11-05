import { mockDelay } from "./delay";
import { ADDRESS_SUGGESTIONS } from "./fixtures/addresses";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Mock of GET /v1/addresses/suggest?q= (CMD-02). From 2 characters, at most 5 results. */
export async function suggestAddresses(query: string): Promise<string[]> {
  await mockDelay(150);
  const wanted = normalize(query);
  if (wanted.length < 2) return [];
  return ADDRESS_SUGGESTIONS.filter((address) => normalize(address).includes(wanted)).slice(0, 5);
}
