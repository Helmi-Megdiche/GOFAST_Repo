import { describe, expect, it } from "vitest";
import { PROOF_VALUE_THRESHOLD_MILLIMES } from "./constants";
import { proofFor } from "./proof";

describe("proof of delivery", () => {
  it.each([
    [{ fragile: false, cod: false }, "codeOrPhotoPosition"],
    [{ fragile: true, cod: false }, "codeOrSignaturePhoto"],
    [{ fragile: false, cod: true }, "codeElseAgentPhone"],
    [{ fragile: true, cod: true }, "codeElseAgentPhone"], // COD wins over fragile
  ])("%o gives %s", (parcel, rule) => {
    expect(proofFor({ ...parcel, declaredValueMillimes: null }).rule).toBe(rule);
  });

  it("has no value threshold yet, so a high value changes nothing", () => {
    expect(PROOF_VALUE_THRESHOLD_MILLIMES).toBeNull();
    const result = proofFor({ fragile: false, cod: false, declaredValueMillimes: 9_000_000_000 });
    expect(result.aboveValueThreshold).toBe(false);
  });

  it("would flag a value at or above a threshold once FastGo gives one (injected)", () => {
    const parcel = { fragile: false, cod: false };
    expect(
      proofFor({ ...parcel, declaredValueMillimes: 500_000 }, 500_000).aboveValueThreshold,
    ).toBe(true);
    expect(
      proofFor({ ...parcel, declaredValueMillimes: 499_999 }, 500_000).aboveValueThreshold,
    ).toBe(false);
    expect(proofFor({ ...parcel, declaredValueMillimes: null }, 500_000).aboveValueThreshold).toBe(
      false,
    );
  });
});
