import { mockDelay } from "./delay";

export type ServiceCode = "express" | "standard" | "scheduled";
export type ParcelTypeCode = "document" | "small" | "medium" | "large";
export type ExtraCode = "fragile" | "declaredValue" | "retry" | "return";

/**
 * Prices, cut-off times, limits and fees are null until GOFAST sets them: the pages show the
 * placeholder ([PRIX], [HEURE], [LIMITE], [TARIF]) in the active language. Nothing is invented.
 */
export type ServiceCatalog = {
  offers: { code: ServiceCode; fromPriceMillimes: number | null; cutoffTime: string | null }[];
  parcelTypes: { code: ParcelTypeCode; limit: string | null }[];
  extras: { code: ExtraCode; feeMillimes: number | null }[];
};

/** Mock of GET /v1/services. */
export async function getServiceOffers(): Promise<ServiceCatalog> {
  await mockDelay(0);
  return {
    offers: [
      { code: "express", fromPriceMillimes: null, cutoffTime: null },
      { code: "standard", fromPriceMillimes: null, cutoffTime: null },
      { code: "scheduled", fromPriceMillimes: null, cutoffTime: null },
    ],
    parcelTypes: [
      { code: "document", limit: null },
      { code: "small", limit: null },
      { code: "medium", limit: null },
      { code: "large", limit: null },
    ],
    extras: [
      { code: "fragile", feeMillimes: null },
      { code: "declaredValue", feeMillimes: null },
      { code: "retry", feeMillimes: null },
      { code: "return", feeMillimes: null },
    ],
  };
}
