import { cancelOption, type CancelOption } from "./cancel-option";
import { mockDelay } from "./delay";
import { getAccountOrder } from "./account-orders";
import { consumeFailNext } from "./mock-db";
import { NetworkError } from "./orders";
import type { Session } from "./session";
import { activePickupMission, cancelOrderWithFee, type CancelFee } from "./states";

/**
 * Client cancel (CMD-08, R212, T06, EX07). "Le client annule gratuitement avant l'arrivée du
 * livreur, avec frais ensuite selon les CGV. Après la prise en charge, il passe par une réclamation."
 */

/** The fee a cancel records for an option that lets the client cancel. */
export function cancelFeeOf(option: Exclude<CancelOption, "claimOnly" | "none">): CancelFee {
  return option === "free" ? "none" : option === "withFee" ? "applies" : "backOfficeDecides";
}

export type CancelResult =
  | { status: "canceled"; fee: CancelFee }
  | { status: "feeRequired"; fee: "applies" | "backOfficeDecides" }
  | { status: "claimOnly" }
  | { status: "notCancellable" }
  | { status: "notFound" };

/**
 * Mock of POST /v1/orders/{id}/cancel. Replay by state (ADR-6): a canceled order answers `canceled`
 * again with no new event. The state and the mission are read again at call time, so a stale page
 * is refused. One write cascades: the order, its parcels and its pickup mission. Every refusal comes
 * before the first write. Who may cancel: the account's own orders, for an individual and for both
 * company roles (EX07, H5), which is what the session scope gives.
 */
export async function cancelOrder(
  session: Session,
  code: string,
  { acceptedFee }: { acceptedFee: CancelFee },
): Promise<CancelResult> {
  await mockDelay();
  if (consumeFailNext("cancelOrder")) throw new NetworkError();
  const order = getAccountOrder(session, code);
  if ("notFound" in order) return { status: "notFound" };
  if (order.status === "canceled") return { status: "canceled", fee: order.cancel?.fee ?? "none" };

  const option = cancelOption(order, activePickupMission(order.code));
  if (option === "claimOnly") return { status: "claimOnly" };
  if (option === "none") return { status: "notCancellable" };
  const fee = cancelFeeOf(option);
  // The client accepts the fee line the dialog showed: a different fee now (a "may apply" that
  // became a certain fee, or the other way round) needs a new consent (RV-05).
  if (fee !== "none" && acceptedFee !== fee) return { status: "feeRequired", fee };
  const result = cancelOrderWithFee(order.code, fee, session.userId);
  return "ok" in result ? { status: "canceled", fee } : { status: "notCancellable" };
}
