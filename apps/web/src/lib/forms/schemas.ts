import { z } from "zod";
import { fileError, MAX_ATTACHMENT_BYTES, isValidTrackingCode } from "@fastgo/domain";
import { DRIVER_DOCUMENTS, DRIVER_VEHICLES } from "../data/driver";

/**
 * Validation rules for the public forms. Messages are error codes, not text: each form looks the
 * code up in `forms.errors.<code>` of the message catalogs (fr, ar, en).
 */
export type FormErrorCode =
  | "required"
  | "phoneInvalid"
  | "emailInvalid"
  | "trackingInvalid"
  | "addressTooShort"
  | "attachmentTooLarge"
  | "attachmentBadType"
  | "documentRequired"
  | "captchaRequired";

const code = (value: FormErrorCode) => value;

// Tunisian numbers have 8 digits, with or without +216 / 00216 (spaces and dashes ignored).
const PHONE = /^(?:\+216|00216)?\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const requiredText = z.string().refine((value) => value.trim() !== "", code("required"));

export const phoneField = z
  .string()
  .refine((value) => value.trim() !== "", code("required"))
  .refine((value) => PHONE.test(value.replace(/[\s-]/g, "")), code("phoneInvalid"));

export const emailField = z
  .string()
  .refine((value) => value.trim() !== "", code("required"))
  .refine((value) => EMAIL.test(value.trim()), code("emailInvalid"));

/** Required tracking code: trimmed, uppercased, FG-XXXX-XXXX. */
export const trackingCodeField = z
  .string()
  .refine((value) => value.trim() !== "", code("required"))
  .refine(isValidTrackingCode, code("trackingInvalid"));

/** Optional tracking code: an empty field is valid, a filled one must match. */
export const optionalTrackingCodeField = z
  .string()
  .refine((value) => value.trim() === "" || isValidTrackingCode(value), code("trackingInvalid"));

export const addressField = z
  .string()
  .refine((value) => value.trim() !== "", code("required"))
  .refine((value) => value.trim().length >= 3, code("addressTooShort"));

/** Optional file, at most 5 MB (exactly 5 MB is accepted). */
export const attachmentField = z
  .custom<File | null>()
  .refine((file) => file == null || file.size <= MAX_ATTACHMENT_BYTES, code("attachmentTooLarge"));

export const trackingFormSchema = z.object({ code: trackingCodeField });
export type TrackingFormValues = z.infer<typeof trackingFormSchema>;

export const zoneFormSchema = z.object({ address: addressField });
export type ZoneFormValues = z.infer<typeof zoneFormSchema>;

export const contactFormSchema = z.object({
  type: z.enum(["question", "quote", "claim"]),
  name: requiredText,
  phone: phoneField,
  email: emailField,
  trackingCode: optionalTrackingCodeField,
  message: requiredText,
  attachment: attachmentField,
  captchaToken: z.string().min(1, code("captchaRequired")),
});
export type ContactFormValues = z.infer<typeof contactFormSchema>;

/** One required identity document: the shared file rule (images and PDF, 5 MB; lib/attachments.ts). */
export const requiredDocumentField = z.custom<File | null>().superRefine((file, ctx) => {
  const fail = (message: FormErrorCode) => ctx.addIssue({ code: "custom", message });
  if (file == null) return fail("documentRequired");
  const problem = fileError({ name: file.name, type: file.type, sizeBytes: file.size });
  if (problem) fail(problem === "tooLarge" ? "attachmentTooLarge" : "attachmentBadType");
});

export const driverFormSchema = z.object({
  fullName: requiredText,
  phone: phoneField,
  vehicle: z.enum(DRIVER_VEHICLES),
  zone: z.enum(["city"]),
  documents: z.object(
    Object.fromEntries(DRIVER_DOCUMENTS.map((key) => [key, requiredDocumentField])) as Record<
      (typeof DRIVER_DOCUMENTS)[number],
      typeof requiredDocumentField
    >,
  ),
});
export type DriverFormValues = z.infer<typeof driverFormSchema>;
