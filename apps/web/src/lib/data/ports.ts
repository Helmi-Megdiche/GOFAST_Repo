import type { ParcelTypeCode, ServiceCode } from "@fastgo/domain";
import type { OrderRequest } from "../order/request";
import type { Locale } from "@fastgo/i18n";
import type { OrderDetailResult } from "./account-orders";
import type { CancelResult } from "./cancel";
import type { CreateOrderResult } from "./orders";
import type { OrdersPage, OrdersQuery } from "./orders-page";
import type { TrackingResult } from "./tracking";
import type { CancelFee } from "./states";
import type { SendResult as MockSendResult, VerifyResult as MockVerifyResult } from "./otp";
import type { Session } from "./session";

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
  /** C02. Throws NetworkError, AuthRequiredError or ServerError. */
  listOrders(session: Session, query: OrdersQuery): Promise<OrdersPage>;
  /** C03, by tracking number. Another account's order answers like an unknown one. */
  getOrderDetail(session: Session, code: string): Promise<OrderDetailResult>;
  /** CMD-08. Replay by state: no Idempotency-Key. `acceptedFee` is the fee the dialog showed. */
  cancelOrder(
    session: Session,
    code: string,
    input: { acceptedFee: CancelFee },
  ): Promise<CancelResult>;
  /** SUI-01, public. Never throws: a failure is `unavailable`. */
  lookupTracking(code: string): Promise<TrackingResult>;
}

export interface PricingPort {
  readonly kind: "mock" | "api";
  packagingPriced(service: ServiceCode, parcelType: ParcelTypeCode): boolean;
}

/** The code purposes the sign-up and reset screens use. */
export type AuthPurpose = "signUp" | "reset";

/** One wait for every 429 (countdown message): retryAt is an ISO time. */
export type AuthWait = { status: "wait"; retryAt: string };
/** 5xx, network cut or timeout: nothing is known to have changed. */
export type AuthUnavailable = { status: "unavailable" };

export type SignInResult =
  | { status: "ok"; session: Session; locale: Locale }
  | { status: "invalidCredentials" }
  | AuthWait
  | AuthUnavailable;

export type AuthSendResult = MockSendResult | AuthWait | AuthUnavailable;

/** On the api, "ok" carries the proof (phone_check_id) that sign-up and reset must send. */
export type AuthVerifyResult =
  | { status: "ok"; checkId?: string }
  | Exclude<MockVerifyResult, { status: "ok" }>
  | AuthUnavailable;

export type SignUpInput = {
  kind: "customer" | "merchant";
  name: string;
  phone: string;
  password: string;
  locale: Locale;
};

export type SignUpResult =
  | { status: "created"; session: Session }
  | { status: "phoneTaken" }
  | { status: "tooShort" }
  | { status: "notVerified" }
  | AuthWait
  | AuthUnavailable;

export type ResetResult =
  | { status: "ok" }
  | { status: "tooShort" }
  | { status: "notVerified" }
  /** A retry after "unavailable" got 422: the first call may have changed the password. */
  | { status: "maybeChanged" }
  | AuthWait
  | AuthUnavailable;

export interface AuthPort {
  readonly kind: "mock" | "api";
  /** Google sign-in stays mock-only (4a-2): false on the api so no mock session mixes with a cookie. */
  readonly googleAvailable: boolean;
  /** The "remember me" box: the api slides the session itself, so it is hidden there. */
  readonly rememberMe: boolean;
  signIn(identifier: string, password: string): Promise<SignInResult>;
  sendCode(phone: string, purpose: AuthPurpose): Promise<AuthSendResult>;
  verifyCode(phone: string, purpose: AuthPurpose, code: string): Promise<AuthVerifyResult>;
  /** `checkId` is the proof from verifyCode (api); undefined on mock. */
  signUp(input: SignUpInput, checkId: string | undefined): Promise<SignUpResult>;
  resetPassword(phone: string, checkId: string | undefined, password: string): Promise<ResetResult>;
  /** Always clears the local copy, even when the server call fails. */
  signOut(): Promise<void>;
  /** Api: GET /v1/me, keeps the copy in step. Mock: the stored session. */
  refreshSession(): Promise<Session | null>;
}
