import { z } from "zod";
import type { Locale } from "@fastgo/i18n";
import { toLatinDigits } from "../digits";
import { normalizePhone } from "../phone";
import type { AddressDraft } from "./draft";
import { PASSWORD_MIN_LENGTH } from "./constants";
import { parseMillimes } from "./money-input";

/** Error codes of the order and sign-in forms, looked up in forms.errors.<code> (fr, ar, en). */
export type OrderErrorCode =
  | "required"
  | "phoneInvalid"
  | "emailInvalid"
  | "addressNotConfirmed"
  | "slotRequired"
  | "slotPast"
  | "parcelTypeRequired"
  | "countInvalid"
  | "weightInvalid"
  | "declaredValueInvalid"
  | "serviceRequired"
  | "paymentRequired"
  | "termsRequired"
  | "passwordTooShort"
  | "codeIncomplete";

const code = (value: OrderErrorCode) => value;

export const requiredText = z.string().refine((value) => value.trim() !== "", code("required"));

/** Tunisian phone, Arabic-Indic digits accepted. */
export const orderPhone = z
  .string()
  .refine((value) => value.trim() !== "", code("required"))
  .refine((value) => normalizePhone(value) != null, code("phoneInvalid"));

/** Number of parcels: a whole number from 1 to 99 (input sanity only; FastGo's limit is [LIMITE]). */
export function parseCount(input: string): number | null {
  const text = toLatinDigits(input).trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 ? value : null;
}

/** Estimated weight in kg, one decimal at most, "2,5" or "2.5". Not money, so a number is fine. */
export function parseWeightKg(input: string): number | null {
  const text = toLatinDigits(input).trim().replace(",", ".");
  if (!/^\d{1,3}(?:\.\d)?$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
}

export function parcelSchema(locale: Locale) {
  return z.object({
    type: z
      .enum(["document", "small", "medium", "large"])
      .nullable()
      .refine((value) => value != null, code("parcelTypeRequired")),
    count: z.string().refine((value) => parseCount(value) != null, code("countInvalid")),
    weightKg: z.string().refine((value) => parseWeightKg(value) != null, code("weightInvalid")),
    content: requiredText,
    declaredValue: z
      .string()
      .refine((value) => parseMillimes(value, locale).ok, code("declaredValueInvalid")),
    fragile: z.boolean(),
  });
}

export const personSchema = z.object({ name: requiredText, phone: orderPhone });

export const signInSchema = z.object({
  identifier: requiredText,
  password: requiredText,
  remember: z.boolean(),
});

/** An address can continue once confirmed (suggestion or pin) and checked, in or out of zone. */
export const confirmedAddress = z
  .custom<AddressDraft>()
  .refine(
    (address) => address.confirmed && address.zone != null && address.zone.status !== "unknown",
    code("addressNotConfirmed"),
  );

export const senderFormSchema = z.object({
  address: confirmedAddress,
  landmark: z.string(),
  name: requiredText,
  phone: orderPhone,
  slotId: z.string().refine((value) => value !== "", code("slotRequired")),
});

export const recipientFormSchema = z.object({
  address: confirmedAddress,
  landmark: z.string(),
  name: requiredText,
  phone: orderPhone,
  instructions: z.string(),
  smsLanguage: z.enum(["fr", "ar", "en"]),
  save: z.boolean(),
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const signUpSchema = z.object({
  kind: z.enum(["customer", "merchant"]),
  name: requiredText,
  phone: orderPhone,
  email: z
    .string()
    .refine((value) => value.trim() === "" || EMAIL.test(value.trim()), code("emailInvalid")),
  password: z
    .string()
    .refine((value) => value.length >= PASSWORD_MIN_LENGTH, code("passwordTooShort")),
  terms: z.boolean().refine((value) => value, code("termsRequired")),
});

export const phoneOnlySchema = z.object({ phone: orderPhone });

export const googlePhoneSchema = z.object({
  phone: orderPhone,
  terms: z.boolean().refine((value) => value, code("termsRequired")),
});

export const newPasswordSchema = z.object({
  password: z
    .string()
    .refine((value) => value.length >= PASSWORD_MIN_LENGTH, code("passwordTooShort")),
});
