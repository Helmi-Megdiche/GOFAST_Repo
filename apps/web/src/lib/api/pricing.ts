import type { PricingPort } from "../data/ports";

/**
 * The contract has no packaging price field yet (decision on #20: no contract change in PR 1), so
 * behind the flag this is not available. Nothing is invented here.
 */
export function createApiPricing(): PricingPort {
  return {
    kind: "api",
    packagingPriced() {
      throw new Error("packagingPriced: not available from the API yet");
    },
  };
}
