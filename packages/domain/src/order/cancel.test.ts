import { describe, expect, it } from "vitest";
import type { OrderStatus } from "../states";
import { canAutoConfirm, cancelFeeOf, cancelOption } from "./cancel";

// GH-22 (PR 4b-2b): R212 and R209 as pure rules, moved from the web mock (R212) or written here (R209).

describe("R212 cancelOption: what the client may do with an order", () => {
  const arrived = { arrivedAt: 1 };
  const notArrived = { arrivedAt: null };
  const rows: Array<[OrderStatus, { arrivedAt: number | null } | null, string]> = [
    ["received", null, "free"],
    ["confirmed", null, "free"],
    ["assigned", null, "free"],
    ["assigned", notArrived, "free"],
    ["assigned", arrived, "withFee"],
    ["pickup_failed", null, "mayHaveFee"],
    ["pickup_failed", arrived, "mayHaveFee"],
    ["picked_up", arrived, "claimOnly"],
    ["in_transit", null, "claimOnly"],
    ["delivered", null, "none"],
    ["partially_delivered", null, "none"],
    ["returned", null, "none"],
    ["lost", null, "none"],
    ["canceled", null, "none"],
  ];
  it.each(rows)("R212 %s with mission %j gives %s", (status, mission, expected) => {
    expect(cancelOption({ status }, mission)).toBe(expected);
  });
});

describe("R212 cancelFeeOf: the CancelFee of the contract", () => {
  it("free is none, withFee is applies, mayHaveFee is backOfficeDecides", () => {
    expect(cancelFeeOf("free")).toBe("none");
    expect(cancelFeeOf("withFee")).toBe("applies");
    expect(cancelFeeOf("mayHaveFee")).toBe("backOfficeDecides");
  });
  it("claimOnly and none have no fee: they are refusals, not a fee", () => {
    expect(cancelFeeOf("claimOnly")).toBeNull();
    expect(cancelFeeOf("none")).toBeNull();
  });
});

describe("R209 canAutoConfirm: the four checks, and which null lines are allowed", () => {
  const ok = {
    status: "received" as OrderStatus,
    phoneVerified: true,
    accountActive: true,
    addressesPinned: true,
    totalMillimes: 100_000,
    capMillimes: 100_000 as number | null,
    lines: [
      { kind: "base", millimes: 6000 },
      { kind: "vat", millimes: null },
      { kind: "stamp", millimes: null },
    ],
  };
  it("confirms a verified, active customer with both addresses pinned, at the cap exactly (the cap is included)", () => {
    expect(canAutoConfirm(ok)).toBe(true);
  });
  it.each([
    ["the phone is not verified", { phoneVerified: false }],
    ["the account is not active", { accountActive: false }],
    ["an address is not pinned", { addressesPinned: false }],
    ["the total is above the cap", { totalMillimes: 100_001 }],
    ["no cap is set (nothing is invented)", { capMillimes: null }],
    ["the order is not received", { status: "confirmed" as OrderStatus }],
    ["a line other than vat and stamp has no amount (Q11)", { lines: [{ kind: "base", millimes: null }, { kind: "vat", millimes: null }] }],
    ["a distance line has no amount", { lines: [{ kind: "distance", millimes: null }] }],
  ])("does not confirm when %s", (_name, over) => {
    expect(canAutoConfirm({ ...ok, ...over })).toBe(false);
  });
  it("a null vat or stamp line does not block it (GOFAST has not confirmed them), a negative discount line neither", () => {
    expect(canAutoConfirm({ ...ok, lines: [{ kind: "base", millimes: 6000 }, { kind: "discount", millimes: -500 }, { kind: "vat", millimes: null }] })).toBe(true);
  });
});
