import { fileError, type AttachmentError, type AttachmentInfo } from "../attachments";
import { CLAIM_ATTACHMENT_MAX_FILES } from "../order/constants";

export type { AttachmentError, AttachmentInfo };
export { isAcceptedType } from "../attachments";

/**
 * The attachment rules of a claim (H12): the shared file rule (`lib/attachments.ts`), at most 5
 * files. Pure, so the form and the mock server apply the same rule.
 */
export function attachmentError(files: AttachmentInfo[]): AttachmentError | null {
  if (files.length > CLAIM_ATTACHMENT_MAX_FILES) return "tooMany";
  const badType = files.some((file) => fileError(file) === "badType");
  if (badType) return "badType";
  return files.some((file) => fileError(file) === "tooLarge") ? "tooLarge" : null;
}
