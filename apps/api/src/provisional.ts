/**
 * Values GOFAST has not confirmed yet (docs/spec/reponses-gofast.md). Each one is read from the
 * settings in the end (admin-editable); until then this file is the only place they live, and the
 * PR lists them. Nothing here is a business decision.
 */
export const PROVISIONAL = {
  /** Customer session, sliding (days). */
  customerSessionDays: 30,
  /** Staff session (hours). */
  staffSessionHours: 12,
  /** Most parcels in one order. */
  maxParcelsPerOrder: 10,
  /** List pages. */
  pageSize: 20,
  maxPageSize: 100,
  /** Digits of an SMS code, also of the Google link code. */
  codeLength: 6,
  /** How long an Idempotency-Key is kept (hours). */
  idempotencyHours: 24,
  /** Session cookie name. */
  cookieName: "session",
} as const;
