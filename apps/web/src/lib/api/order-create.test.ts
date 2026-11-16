import { describe, expect, it } from "vitest";
import { buildOrderRequest } from "../order/request";
import { readyDraft } from "../order/test-draft";
import { serializeOrderBody, toOrderCreate } from "./order-create";

const T0 = Date.parse("2026-11-04T08:30:00Z");

function request() {
  const built = buildOrderRequest(readyDraft(T0), true);
  if (!built) throw new Error("readyDraft must build a request");
  return built;
}

describe("OrderRequest to OrderCreate (#20)", () => {
  it("maps to the contract's snake_case shape, with integer millimes and no zone", () => {
    const req = request();
    const body = toOrderCreate(req);
    expect(body.quote_id).toBe(req.quote.id);
    expect(body.accepted_total_millimes).toBe(req.quote.totalMillimes);
    expect(Number.isInteger(body.accepted_total_millimes)).toBe(true);
    expect(body.terms_accepted).toBe(true);
    expect(body.payment_mode).toBe(req.payment);
    expect(body.parcel.parcels).toEqual(req.parcel.weightsG.map((weight_g) => ({ weight_g })));
    expect(body.sender.slot).toEqual({
      start_at: req.sender.slot.startUtc,
      end_at: req.sender.slot.endUtc,
    });
    expect(body.recipient.sms_locale).toBe(req.recipient.smsLanguage);
    expect(body.sender.address.text).toBe(req.sender.address);
    expect(JSON.stringify(body)).not.toContain("zone");
  });

  it("sends the verified-phone proof only when there is one", () => {
    expect(toOrderCreate(request()).phone_check_id).toBeUndefined();
    expect(toOrderCreate(request(), "chk_1").phone_check_id).toBe("chk_1");
  });

  it("the serialized body is stable: same request, same bytes", () => {
    const req = request();
    expect(serializeOrderBody(req)).toBe(serializeOrderBody(req));
  });
});
