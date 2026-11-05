"use client";

import { useSearchParams } from "next/navigation";
import { CodePage } from "./code-page";
import { ForgotForm } from "./forgot-form";
import { GooglePhone } from "./google-phone";
import { NewPasswordForm } from "./new-password-form";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

/**
 * ?next= is read in the browser so the auth pages stay static. Each page renders the same form
 * with next = null as its Suspense fallback, so the server HTML already has the h1 and the form.
 */
const useNext = () => useSearchParams().get("next");

export const SignInFromUrl = () => <SignInForm next={useNext()} />;
export const SignUpFromUrl = () => <SignUpForm next={useNext()} />;
export const CodeFromUrl = () => <CodePage next={useNext()} />;
export const ForgotFromUrl = () => <ForgotForm next={useNext()} />;
export const NewPasswordFromUrl = () => <NewPasswordForm next={useNext()} />;
export const GooglePhoneFromUrl = () => <GooglePhone next={useNext()} />;
