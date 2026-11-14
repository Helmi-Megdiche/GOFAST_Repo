import { describe, expect, it } from "vitest";
import { ATTACHMENT_TYPES, fileError } from "./attachments";
import { MAX_ATTACHMENT_BYTES } from "./limits";
import { CLAIM_ATTACHMENT_MAX_BYTES, CLAIM_ATTACHMENT_TYPES } from "./order/constants";

describe("the shared file rule", () => {
  it("is the one source of the claim limits (a single 5 MB, a single type list)", () => {
    expect(CLAIM_ATTACHMENT_MAX_BYTES).toBe(MAX_ATTACHMENT_BYTES);
    expect(CLAIM_ATTACHMENT_TYPES).toBe(ATTACHMENT_TYPES);
  });
  it("accepts exactly the limit and refuses one byte more or another type", () => {
    const pdf = { name: "a.pdf", type: "application/pdf", sizeBytes: MAX_ATTACHMENT_BYTES };
    expect(fileError(pdf)).toBeNull();
    expect(fileError({ ...pdf, sizeBytes: MAX_ATTACHMENT_BYTES + 1 })).toBe("tooLarge");
    expect(fileError({ ...pdf, type: "application/zip" })).toBe("badType");
    expect(fileError({ ...pdf, type: "", name: "a.PNG" })).toBeNull();
  });
});
