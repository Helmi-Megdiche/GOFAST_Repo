import { normalizePhone, packagingPriced } from "@fastgo/domain";
import { createAccount, sessionFor } from "./accounts";
import { setNewPassword, signIn } from "./auth";
import { EXAMPLE_PRICE_TABLE } from "./fixtures/pricing";
import { createOrder, findOrderByKey } from "./orders";
import { consumeVerification, isTargetVerified, sendCode, verifyCode } from "./otp";
import type { AuthPort, OrdersPort, PricingPort } from "./ports";
import { getSession, setSession, signOut } from "./session";

export function createMockOrders(): OrdersPort {
  return {
    kind: "mock",
    keyLifetimeMs: null,
    prepare: () => undefined,
    createOrder: (request, key) => createOrder(request, key),
    findOrderByKey,
  };
}

export function createMockPricing(): PricingPort {
  return {
    kind: "mock",
    packagingPriced: (service, parcelType) =>
      packagingPriced(EXAMPLE_PRICE_TABLE, service, parcelType),
  };
}

/** The mock server of the auth screens: today's modules behind the port, behaviour unchanged. */
export function createMockAuth(): AuthPort {
  return {
    kind: "mock",
    googleAvailable: true,
    rememberMe: true,
    signIn,
    sendCode: (phone, purpose) => sendCode({ channel: "sms", value: phone }, purpose),
    verifyCode: (phone, purpose, code) =>
      verifyCode({ channel: "sms", value: phone }, code, purpose),
    // The SMS code proves the phone only. The proof id is an api notion: the mock has none.
    async signUp(input) {
      const phone = normalizePhone(input.phone);
      const target = { channel: "sms", value: phone ?? input.phone } as const;
      if (!phone || !isTargetVerified(target, "signUp")) return { status: "notVerified" };
      // The typed e-mail is never attached here: it is confirmed later (no e-mail enumeration).
      const created = createAccount({
        kind: input.kind,
        name: input.name,
        phone,
        email: null,
        locale: input.locale,
      });
      if (created.status === "phoneTaken") return { status: "phoneTaken" };
      if (created.status !== "created") return { status: "notVerified" };
      consumeVerification(target, "signUp");
      const session = sessionFor(created.account);
      setSession(session);
      return { status: "created", session };
    },
    resetPassword: (phone, _checkId, password) => setNewPassword(phone, password),
    async signOut() {
      signOut();
    },
    async refreshSession() {
      return getSession();
    },
  };
}
