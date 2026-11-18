import { z } from "zod";

/**
 * The back-office sign-in form (A00). The messages are error CODES, never text: the screen turns a code into a translated message
 * (`backoffice.signIn.errors.<code>`), so the three languages and the tests share one thing.
 */
export const staffSignInSchema = z.object({
  identifier: z.string().trim().min(1, "identifierRequired"),
  password: z.string().min(1, "passwordRequired"),
  code: z.string().regex(/^[0-9]{6}$/, "codeInvalid"),
});
export type StaffSignInValues = z.infer<typeof staffSignInSchema>;
export type FormErrorCode = "identifierRequired" | "passwordRequired" | "codeInvalid";
