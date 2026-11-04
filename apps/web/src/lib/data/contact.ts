import { MAX_ATTACHMENT_BYTES } from "../limits";
import { isValidTrackingCode } from "../tracking-code";
import { mockDelay } from "./delay";
import { verifyCaptcha } from "./captcha";
import { FIXTURE_TICKET_ID } from "./fixtures/contact";

export type ContactRequestType = "question" | "quote" | "claim";

export type ContactInput = {
  type: ContactRequestType;
  name: string;
  phone: string;
  email: string;
  trackingCode: string;
  message: string;
  attachment: { name: string; sizeBytes: number } | null;
  captchaToken: string;
};

export type ContactResult =
  | { status: "created"; ticketId: string; receivedAtUtc: string }
  | { status: "error"; code: "attachment-too-large" | "captcha-failed" | "invalid-tracking-code" };

/** Mock of POST /v1/contact (FE-06): opens a ticket. The server repeats the client checks. */
export async function submitContact(input: ContactInput): Promise<ContactResult> {
  await mockDelay(600);
  if (input.attachment && input.attachment.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { status: "error", code: "attachment-too-large" };
  }
  if (input.trackingCode.trim() !== "" && !isValidTrackingCode(input.trackingCode)) {
    return { status: "error", code: "invalid-tracking-code" };
  }
  if (!(await verifyCaptcha(input.captchaToken))) {
    return { status: "error", code: "captcha-failed" };
  }
  return {
    status: "created",
    ticketId: FIXTURE_TICKET_ID,
    receivedAtUtc: new Date().toISOString(),
  };
}
