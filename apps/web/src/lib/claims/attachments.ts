import {
  CLAIM_ATTACHMENT_MAX_BYTES,
  CLAIM_ATTACHMENT_MAX_FILES,
  CLAIM_ATTACHMENT_TYPES,
} from "../order/constants";

/**
 * The attachment rules of a claim (H12): images and PDF, 5 MB per file, at most 5 files. Pure, so the
 * form and the mock server apply the same rule.
 */
export type AttachmentError = "tooLarge" | "badType" | "tooMany";

export type AttachmentInfo = { name: string; sizeBytes: number; type: string };

const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** The media type to trust: the declared one, or, when the browser gave none, the one the extension says. */
function typeOf(file: AttachmentInfo): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[extension] ?? "";
}

export function isAcceptedType(file: AttachmentInfo): boolean {
  return (CLAIM_ATTACHMENT_TYPES as readonly string[]).includes(typeOf(file));
}

/** The first problem of the list as a whole, or null. Exactly 5 MB passes, one byte more is refused. */
export function attachmentError(files: AttachmentInfo[]): AttachmentError | null {
  if (files.length > CLAIM_ATTACHMENT_MAX_FILES) return "tooMany";
  if (files.some((file) => !isAcceptedType(file))) return "badType";
  if (files.some((file) => file.sizeBytes > CLAIM_ATTACHMENT_MAX_BYTES)) return "tooLarge";
  return null;
}
