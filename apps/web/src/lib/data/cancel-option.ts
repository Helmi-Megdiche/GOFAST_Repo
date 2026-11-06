import type { AccountOrder, Mission } from "./order-model";

/** CMD-08, R212: what the client may do with an order. */
export type CancelOption = "free" | "withFee" | "mayHaveFee" | "claimOnly" | "none";

/**
 * What the client may do with an order, from its state and its pickup mission (the latest one that
 * is not refused, expired or ended early). Pure: the caller reads the mission.
 * - `free` before the driver arrives, including `confirmed` again after a failed pickup;
 * - `withFee` once the pickup mission has `arrivedAt`, before pickup;
 * - `mayHaveFee` after a failed pickup (R505, H6): the back-office decides;
 * - `claimOnly` from pickup on: no cancel, a claim instead;
 * - `none` once the order is over.
 */
export function cancelOption(
  order: Pick<AccountOrder, "status">,
  pickupMission: Pick<Mission, "arrivedAt"> | null,
): CancelOption {
  switch (order.status) {
    case "received":
    case "confirmed":
      return "free";
    case "assigned":
      return pickupMission?.arrivedAt ? "withFee" : "free";
    case "pickup_failed":
      return "mayHaveFee";
    case "picked_up":
    case "in_transit":
      return "claimOnly";
    default:
      return "none";
  }
}
