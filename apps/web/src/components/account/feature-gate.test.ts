import { describe, expect, it } from "vitest";
import { profilePort } from "@/lib/data";
import { featureAvailable, type AccountFeature } from "./feature-available";

const FEATURES: AccountFeature[] = ["home", "email", "addressBook", "invoices", "claims"];

/** GH-20 (20-d, RV-28): with `account` on, a screen without an API route is hidden, not filled with mock data. */
describe("feature gate", () => {
  it.each(FEATURES)(
    "%s is off on the api adapter (the screen says so, children never mount)",
    (f) => {
      expect(featureAvailable(profilePort("account", "fr"), f)).toBe(false);
    },
  );

  it.each(FEATURES)("%s is on on the mock adapter (flag off: nothing changes)", (f) => {
    expect(featureAvailable(profilePort("", "fr"), f)).toBe(true);
    expect(featureAvailable(profilePort(undefined, "fr"), f)).toBe(true);
  });
});
