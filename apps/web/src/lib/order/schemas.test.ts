import { describe, expect, it } from "vitest";
import { parcelSchema, parcelWeightsG, parseCount, parseWeightG } from "./schemas";

describe("parcel count and weights (PR 1b)", () => {
  it("accepts 1 to 10 parcels, in Latin or Arabic-Indic digits, and nothing else", () => {
    expect(["1", "5", "10", "٣"].map(parseCount)).toEqual([1, 5, 10, 3]);
    for (const bad of ["", "0", "11", "99", "1.5", "-1", "abc", "010"]) {
      expect(parseCount(bad), bad).toBeNull();
    }
  });

  it("reads a weight in whole grams without a float", () => {
    expect(parseWeightG("2,5")).toBe(2_500);
    expect(parseWeightG("0.1")).toBe(100);
    expect(parseWeightG("٢")).toBe(2_000);
    expect(parseWeightG("2,55")).toBeNull();
    expect(parseWeightG("0")).toBeNull();
  });

  it("needs one readable weight for each of the first `count` parcels", () => {
    expect(parcelWeightsG("3", ["1", "2,5", "4"])).toEqual([1_000, 2_500, 4_000]);
    expect(parcelWeightsG("2", ["1", "2", "not read"])).toEqual([1_000, 2_000]);
    expect(parcelWeightsG("3", ["1", "2"])).toBeNull();
    expect(parcelWeightsG("2", ["1", "x"])).toBeNull();
    expect(
      parcelWeightsG(
        "11",
        Array.from({ length: 11 }, () => "1"),
      ),
    ).toBeNull();
  });

  it("the form shows the error under the weight of the parcel that is wrong", () => {
    const result = parcelSchema("fr").safeParse({
      type: "small",
      count: "3",
      weights: ["1", "", "2"],
      content: "Livres",
      declaredValue: "",
      fragile: false,
      packaging: false,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["weights.1", "weightInvalid"],
    ]);
  });
});
