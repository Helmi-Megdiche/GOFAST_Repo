import { z } from "zod";
import type { Locale } from "@fastgo/i18n";
import {
  toLatinDigits,
  normalizePhone,
  PASSWORD_MIN_LENGTH,
  parseMillimes,
  MAX_PARCELS,
} from "@fastgo/domain";
import type { AddressDraft } from "./draft";

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

/** Number of parcels: a whole number from 1 to 10 (MAX_PARCELS, provisional: GOFAST's setting). */
export function parseCount(input: string): number | null {
  const text = toLatinDigits(input).trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= MAX_PARCELS ? value : null;
}

/** Estimated weight in kg, one decimal at most, "2,5" or "2.5". Not money, so a number is fine. */
export function parseWeightKg(input: string): number | null {
  const text = toLatinDigits(input).trim().replace(",", ".");
  if (!/^\d{1,3}(?:\.\d)?$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
}

/** The same weight in whole grams (one decimal in kg at most, so no float is left over). */
export function parseWeightG(input: string): number | null {
  const kg = parseWeightKg(input);
  return kg == null ? null : Math.round(kg * 10) * 100;
}

/**
 * The weights the order has: one per parcel, null while one of the first `count` is missing or
 * unreadable (or the count itself is).
 */
export function parcelWeightsG(count: string, weights: readonly (string | undefined)[]) {
  const n = parseCount(count);
  if (n == null) return null;
  const grams = Array.from({ length: n }, (_, i) => parseWeightG(weights[i] ?? ""));
  return grams.every((value): value is number => value != null) ? grams : null;
}

export function parcelSchema(locale: Locale) {
  return z
    .object({
      type: z
        .enum(["document", "small", "medium", "large"])
        .nullable()
        .refine((value) => value != null, code("parcelTypeRequired")),
      count: z.string().refine((value) => parseCount(value) != null, code("countInvalid")),
      weights: z.array(z.string().optional()),
      content: requiredText,
      declaredValue: z
        .string()
        .refine((value) => parseMillimes(value, locale).ok, code("declaredValueInvalid")),
      fragile: z.boolean(),
      packaging: z.boolean(),
    })
    .superRefine((value, ctx) => {
      // One weight per parcel: each of the first `count` is checked, the error shows under its field.
      const n = parseCount(value.count);
      if (n == null) return;
      for (let i = 0; i < n; i++) {
        if (parseWeightKg(value.weights[i] ?? "") == null)
          ctx.addIssue({ code: "custom", message: code("weightInvalid"), path: ["weights", i] });
      }
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
