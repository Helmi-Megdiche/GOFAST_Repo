import type { ParcelTypeCode, ServiceCode } from "@fastgo/domain";
import type { OrderRequest } from "../order/request";
import type { CreateOrderResult } from "./orders";

/** One interface per data domain, two adapters (mock and api). Components never import an adapter. */
export interface OrdersPort {
  readonly kind: "mock" | "api";
  /** The exact request body to store in the draft before the first send; undefined when none is needed. */
  prepare(request: OrderRequest): string | undefined;
  /** `body` is the stored bytes of a retry: re-sent unchanged. Throws NetworkError when the answer is lost. */
  createOrder(request: OrderRequest, key: string, body?: string): Promise<CreateOrderResult>;
  /** Mock: the lookup by key. Api: always null (there is no route; a replay settles it). */
  findOrderByKey(key: string): Promise<string | null>;
  /** How long the server remembers a key; null when it never forgets (mock). */
  readonly keyLifetimeMs: number | null;
}

export interface PricingPort {
  readonly kind: "mock" | "api";
  packagingPriced(service: ServiceCode, parcelType: ParcelTypeCode): boolean;
}
