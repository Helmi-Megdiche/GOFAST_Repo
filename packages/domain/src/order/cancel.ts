import type { OrderStatus } from "../states";
import type { CancelFee } from "./order-model";

/** CMD-08, R212: what the client may do with an order. */
export type CancelOption = "free" | "withFee" | "mayHaveFee" | "claimOnly" | "none";

/**
 * What the client may do with an order, from its state and its pickup mission (the latest one that is not refused,
 * expired or ended early). Pure: the caller reads the mission, and the amount of the fee is a setting.
 * - `free` before the driver arrives, including `confirmed` again after a failed pickup;
 * - `withFee` once the pickup mission has `arrivedAt`, before pickup;
 * - `mayHaveFee` after a failed pickup (R505, H6): the back-office decides;
 * - `claimOnly` from pickup on: no cancel, a claim instead;
 * - `none` once the order is over.
 */
export function cancelOption(
  order: { status: OrderStatus },
  pickupMission: { arrivedAt: unknown } | null,
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

/** The fee a cancel records for an option that lets the client cancel; null for `claimOnly` and `none` (refusals, not a fee). */
export function cancelFeeOf(option: CancelOption): CancelFee | null {
  if (option === "free") return "none";
  if (option === "withFee") return "applies";
  if (option === "mayHaveFee") return "backOfficeDecides";
  return null;
}

/** The lines VAT and stamp may have no amount until GOFAST and the accountant confirm them (reponses-gofast.md). */
const MAY_BE_UNPRICED = new Set(["vat", "stamp"]);

/**
 * R209, D8: the system confirms an order by itself when the order is still `received`, the customer's phone is verified and
 * the account active, both addresses are pinned, and the total is at most the cap of the settings. "Sans retard de paiement"
 * and "à faible risque" have no data yet (follow-up issue): they are not checked. A null line other than VAT and stamp is a
 * missing price (Q11): an agent looks at the order. No cap (null) means no automatic confirmation: nothing is invented.
 */
export function canAutoConfirm(order: {
  status: OrderStatus;
  phoneVerified: boolean;
  accountActive: boolean;
  addressesPinned: boolean;
  totalMillimes: number;
  capMillimes: number | null;
  lines: readonly { kind: string; millimes: number | null }[];
}): boolean {
  return (
    order.status === "received" &&
    order.phoneVerified &&
    order.accountActive &&
    order.addressesPinned &&
    order.capMillimes !== null &&
    order.totalMillimes <= order.capMillimes &&
    order.lines.every((l) => l.millimes !== null || MAY_BE_UNPRICED.has(l.kind))
  );
}
