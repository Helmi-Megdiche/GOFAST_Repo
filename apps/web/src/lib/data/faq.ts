import { mockDelay } from "./delay";

export type FaqTopic = "order" | "tracking" | "payment" | "claims" | "merchants";
export type FaqQuestionCode =
  "price" | "cancel" | "absent" | "deliveryCode" | "damaged" | "invoice";

/** `answered: false` means the answer is not written yet: the page shows [RÉPONSE]. */
export type FaqEntry = { code: FaqQuestionCode; topic: FaqTopic; answered: boolean };

export type Faq = { topics: FaqTopic[]; questions: FaqEntry[] };

/** Mock of GET /v1/help. Question and answer text live in the message catalogs. */
export async function getFaq(): Promise<Faq> {
  await mockDelay(0);
  return {
    topics: ["order", "tracking", "payment", "claims", "merchants"],
    questions: [
      { code: "price", topic: "order", answered: true },
      { code: "cancel", topic: "order", answered: false },
      { code: "absent", topic: "tracking", answered: false },
      { code: "deliveryCode", topic: "tracking", answered: false },
      { code: "damaged", topic: "claims", answered: false },
      { code: "invoice", topic: "payment", answered: false },
    ],
  };
}
