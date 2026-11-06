import { describe, expect, it } from "vitest";
import { PROOF_VALUE_THRESHOLD_MILLIMES } from "./constants";
import { handoverCodeRequired, proofFor, proofLevelFor } from "./proof";

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

  it("would flag a value above a threshold once FastGo gives one (injected, cahier: above)", () => {
    const parcel = { fragile: false, cod: false };
    expect(
      proofFor({ ...parcel, declaredValueMillimes: 500_001 }, 500_000).aboveValueThreshold,
    ).toBe(true);
    expect(
      proofFor({ ...parcel, declaredValueMillimes: 500_000 }, 500_000).aboveValueThreshold,
    ).toBe(false);
    expect(proofFor({ ...parcel, declaredValueMillimes: null }, 500_000).aboveValueThreshold).toBe(
      false,
    );
  });
});

describe("proofLevelFor (strongest wins)", () => {
  const PLAIN = { fragile: false, codMillimes: null };
  const ORDER = { totalDeclaredValueMillimes: null, strongerProofRequested: false };
  const STRONGEST = "codeOrAgentPhoneWithSignatureAndPhoto";

  it("plain parcel: code or photo with position", () => {
    expect(proofLevelFor(PLAIN, ORDER)).toBe("codeOrPhotoWithPosition");
  });

  it("fragile, or a stronger proof requested: the middle level", () => {
    expect(proofLevelFor({ ...PLAIN, fragile: true }, ORDER)).toBe("codeOrSignatureAndPhoto");
    expect(proofLevelFor(PLAIN, { ...ORDER, strongerProofRequested: true })).toBe(
      "codeOrSignatureAndPhoto",
    );
  });

  it("COD gives the strongest level, also with fragile", () => {
    expect(proofLevelFor({ ...PLAIN, codMillimes: 20_000 }, ORDER)).toBe(STRONGEST);
    expect(proofLevelFor({ fragile: true, codMillimes: 20_000 }, ORDER)).toBe(STRONGEST);
  });

  it("an order total strictly above the threshold gives every parcel the strongest level", () => {
    const order = { ...ORDER, totalDeclaredValueMillimes: 150_000 };
    for (let i = 0; i < 3; i++) expect(proofLevelFor(PLAIN, order, 100_000)).toBe(STRONGEST);
    expect(proofLevelFor(PLAIN, { ...ORDER, totalDeclaredValueMillimes: 100_000 }, 100_000)).toBe(
      "codeOrPhotoWithPosition",
    );
  });

  it("COD on one parcel with no threshold: only that parcel is strongest", () => {
    const order = { ...ORDER, totalDeclaredValueMillimes: 150_000 };
    expect(proofLevelFor({ ...PLAIN, codMillimes: 1000 }, order, null)).toBe(STRONGEST);
    expect(proofLevelFor(PLAIN, order, null)).toBe("codeOrPhotoWithPosition");
  });

  it("a null threshold never triggers", () => {
    const order = { ...ORDER, totalDeclaredValueMillimes: 9_000_000_000 };
    expect(proofLevelFor(PLAIN, order, null)).toBe("codeOrPhotoWithPosition");
    expect(handoverCodeRequired(PLAIN, order, null)).toBe(false);
  });

  it("handoverCodeRequired: COD or total above the threshold", () => {
    expect(handoverCodeRequired({ ...PLAIN, codMillimes: 1 }, ORDER)).toBe(true);
    expect(
      handoverCodeRequired(PLAIN, { ...ORDER, totalDeclaredValueMillimes: 100_001 }, 100_000),
    ).toBe(true);
    expect(handoverCodeRequired({ ...PLAIN, fragile: true }, ORDER)).toBe(false);
  });
});
