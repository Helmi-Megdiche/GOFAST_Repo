import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "../limits";
import { CLAIM_ATTACHMENT_MAX_FILES } from "../order/constants";
import { attachmentError } from "./attachments";

const png = (sizeBytes = 1) => ({ name: "a.png", sizeBytes, type: "image/png" });
const docx = { name: "a.docx", sizeBytes: 1, type: "" };

describe("claim attachments (H12)", () => {
  it("no file, or files within the rules, is accepted", () => {
    expect(attachmentError([])).toBeNull();
    expect(attachmentError([png(MAX_ATTACHMENT_BYTES)])).toBeNull();
  });

  it("the first error wins: too many files, then a bad type, then a size", () => {
    const tooMany = Array.from({ length: CLAIM_ATTACHMENT_MAX_FILES + 1 }, () => docx);
    expect(attachmentError(tooMany)).toBe("tooMany");
    expect(attachmentError([png(MAX_ATTACHMENT_BYTES + 1), docx])).toBe("badType");
    expect(attachmentError([png(MAX_ATTACHMENT_BYTES + 1)])).toBe("tooLarge");
  });
});
