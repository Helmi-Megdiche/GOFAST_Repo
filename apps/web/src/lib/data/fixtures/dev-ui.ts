/**
 * Example data for /dev/ui. Fake values only (CLAUDE.md): no real customer data.
 * Language-neutral values live here; translated words live in packages/i18n.
 */
export const devUiFixtures = {
  trackingCode: "FG-7K4M-2QXP",
  phone: "+216 20 123 456",
  /** 2026-11-04 23:30 UTC = 2026-11-05 00:30 in Tunis: shows the time zone shift. */
  instant: "2026-11-04T23:30:00Z",
  /** Amounts in millimes. */
  amounts: [0, 500, 48500, 1152000, -48500],
  kpi: { collected: 1248000, fees: 96000, receive: 1152000 },
  orders: [
    { code: "FG-7K4M-2QXP", status: "delivered", amount: 48500 },
    { code: "FG-3H9D-5WLN", status: "inProgress", amount: 1152000 },
    { code: "FG-8R2T-6ZCB", status: "pending", amount: 12000 },
  ],
} as const;
