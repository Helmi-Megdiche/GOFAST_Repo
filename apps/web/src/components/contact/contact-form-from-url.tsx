"use client";

import { useSearchParams } from "next/navigation";
import { ContactForm } from "./contact-form";

/**
 * Reads ?type= in the browser (so the page stays static) and hands it to the form. Until then
 * the page shows <ContactForm requestedType="" /> as the Suspense fallback.
 */
export function ContactFormFromUrl() {
  return <ContactForm requestedType={useSearchParams().get("type") ?? ""} />;
}
