/**
 * Every order and sign-in value in one place. Only the 15-minute price guarantee comes from the
 * cahier (CMD-04, R205). Everything marked "unsourced" comes from the mockup or is a proposal: it is
 * listed in the PR for FastGo to confirm. Do not copy these numbers anywhere else.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** R205: the price is valid for 15 minutes, then recalculated and validated again. Sourced. */
export const QUOTE_VALIDITY_MS = 15 * MINUTE;

/** Unsourced (proposal): a draft is kept 24 h after its last edit, then deleted on read. */
export const DRAFT_RETENTION_MS = 24 * HOUR;

/** Unsourced (mockup W20): the SMS code has 6 digits. */
export const CODE_LENGTH = 6;

/** Unsourced (mockup W20 "valable 5 minutes"). */
export const CODE_VALIDITY_MS = 5 * MINUTE;

/** Unsourced (the mockup shows a 42 s countdown with no source): a new code after 60 s. */
export const CODE_RESEND_DELAY_MS = 60 * 1000;

/** Unsourced (proposal, R102 "limited attempts"): 5 wrong codes, then locked for 15 minutes. */
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_LOCK_MS = 15 * MINUTE;

/**
 * Unsourced (proposal, PR #5 review): a verified code still counts for its step (create the account
 * or the order, set a new password) for 10 minutes after it was typed, then it must be sent again.
 */
export const CODE_VERIFIED_WINDOW_MS = 10 * MINUTE;

/**
 * Unsourced (proposal, PR #5 review): a Google sign-in left half-way (W22, the e-mail or SMS code) is
 * forgotten 30 minutes after the account was chosen in the Google chooser.
 */
export const GOOGLE_PENDING_MAX_AGE_MS = 30 * MINUTE;

/** Unsourced (proposal): at most 5 codes sent to one phone or e-mail in the same 15 minutes. */
export const CODE_MAX_SENDS = 5;
export const CODE_SEND_WINDOW_MS = 15 * MINUTE;

/** Unsourced (mockup W19 "10 caractères au minimum"). */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Declared value above which a stronger proof would apply. FastGo has not fixed it: null means the
 * rule never triggers (see proof.ts). Do not put a number here without the cahier.
 */
export const PROOF_VALUE_THRESHOLD_MILLIMES: number | null = null;
