/**
 * Tracking codes look like FG-7K4M-2QXP. The cahier confirms the FG-XXXX-XXXX shape but gives no
 * alphabet: letters A-Z and digits 0-9 are an assumption. One validator for the home form, the
 * tracking page, the contact form and the mock data layer.
 */
export const TRACKING_CODE_FORMAT = /^FG-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Trim and uppercase what the visitor typed. */
export function normalizeTrackingCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidTrackingCode(input: string): boolean {
  return TRACKING_CODE_FORMAT.test(normalizeTrackingCode(input));
}
