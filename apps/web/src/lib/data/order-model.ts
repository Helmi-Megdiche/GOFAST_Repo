export {
  FAILURE_REASONS,
  type AccountOrder,
  type CancelFee,
  type DeliveryCode,
  type FailureReason,
  type Mission,
  type Parcel,
  type StatusEvent,
} from "@fastgo/domain";

/** Mock tables (ADR-1). Read and written only from lib/data, through readTable / writeRow. */
export const ACCOUNT_ORDERS = "fg.mock.accountOrders";
export const PARCELS = "fg.mock.parcels";
export const MISSIONS = "fg.mock.missions";
export const STATUS_EVENTS = "fg.mock.statusEvents";
export const DELIVERY_CODES = "fg.mock.deliveryCodes";
export const RECIPIENT_LINKS = "fg.mock.recipientLinks";
export const OUTBOX = "fg.mock.outbox";

/**
 * What an order's sender name becomes once its owner closed the account (R105): a catalog key the
 * pages show as "Compte fermé" in the active language. Never text in the data layer.
 */
export const CLOSED_ACCOUNT_NAME = "i18n:account.closedName";
