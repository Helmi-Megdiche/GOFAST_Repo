/**
 * Illustrative figures for the home page cards, labelled "Exemple" on the page. Fake names and
 * amounts. Never shown on the public tracking page (SUI-01: no personal data).
 */
export const HOME_EXAMPLE = {
  trackingCode: "FG-7K4M-2QXP",
  etaUtc: "2026-11-04T13:20:00Z",
  pickedUpUtc: "2026-11-04T11:40:00Z",
  distanceKm: 1.8,
  cashToPayMillimes: 48500,
  deliveryCode: "4827",
  statement: {
    receivableMillimes: 1152000,
    collectedMillimes: 1248000,
    feesMillimes: -96000,
  },
};

/** Weekly statement shown on the merchants page (W03). Fake figures. */
export const MERCHANT_EXAMPLE = {
  delivered: 38,
  returned: 4,
  collectedMillimes: 1248000,
  feesMillimes: -96000,
  receivableMillimes: 1152000,
};
