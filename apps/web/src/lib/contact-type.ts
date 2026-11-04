import type { ContactRequestType } from "@/lib/data/contact";

// A Map, not an object: "?type=constructor" or "?type=__proto__" must not find anything.
const FROM_QUERY = new Map<string, ContactRequestType>([
  ["question", "question"],
  ["devis", "quote"],
  ["quote", "quote"],
  ["reclamation", "claim"],
  ["claim", "claim"],
]);

/** Request type preselected by /contact?type=...; anything unknown means "question". */
export function contactTypeFromQuery(value: string | null | undefined): ContactRequestType {
  return FROM_QUERY.get((value ?? "").toLowerCase()) ?? "question";
}
