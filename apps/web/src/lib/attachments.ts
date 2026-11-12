import { MAX_ATTACHMENT_BYTES } from "./limits";

/**
 * The one rule for an uploaded file, shared by the claim attachments (H12), the driver documents
 * (FE-05) and their mock servers: images and PDF, at most MAX_ATTACHMENT_BYTES. The contact form
 * (FE-06) has the size rule only. Pure, so a form and its mock server cannot disagree.
 * Provisional: GOFAST answers, 6 Nov 2026 (claims); assumed for the driver documents.
 */
export const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

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
  return (ATTACHMENT_TYPES as readonly string[]).includes(typeOf(file));
}

/** The first problem of one file, or null. Exactly 5 MB passes, one byte more is refused. */
export function fileError(file: AttachmentInfo): Exclude<AttachmentError, "tooMany"> | null {
  if (!isAcceptedType(file)) return "badType";
  if (file.sizeBytes > MAX_ATTACHMENT_BYTES) return "tooLarge";
  return null;
}
