/**
 * Every order and sign-in value in one place. Only the 15-minute price guarantee comes from the
 * cahier (CMD-04, R205). Everything marked "unsourced" comes from the mockup or is a proposal: it is
 * listed in the PR for GOFAST to confirm. Values marked "Provisional" come from GOFAST's answers of
 * 6 Nov 2026 (docs/spec/reponses-gofast.md). Do not copy these numbers anywhere else.
 */

import { ATTACHMENT_TYPES } from "../attachments";
import { MAX_ATTACHMENT_BYTES } from "../limits";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** R205: the price is valid for 15 minutes, then recalculated and validated again. Sourced. */
export const QUOTE_VALIDITY_MS = 15 * MINUTE;

/** Unsourced (proposal): a draft is kept 24 h after its last edit, then deleted on read. */
export const DRAFT_RETENTION_MS = 24 * HOUR;

/**
 * Provisional: GOFAST answers, 6 Nov 2026 (docs/spec/reponses-gofast.md).
 * R406: the recipient link stops working 24 h after the order is final.
 */
export const RECIPIENT_LINK_AFTER_DELIVERY_MS = 24 * HOUR;

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
 * Digits of a parcel's handover code.
 * Provisional: GOFAST answers, 6 Nov 2026 (docs/spec/reponses-gofast.md).
 */
export const DELIVERY_CODE_DIGITS = 4;

/**
 * Declared value above which a stronger proof would apply. GOFAST has not fixed it: null means the
 * rule never triggers (see proof.ts). Do not put a number here without the cahier.
 */
export const PROOF_VALUE_THRESHOLD_MILLIMES: number | null = null;

/**
 * Fee when the client cancels once the driver has arrived (CMD-08, R212, D7). Millimes.
 * Provisional: GOFAST answers, 6 Nov 2026 (docs/spec/reponses-gofast.md). Also the amount that may
 * apply after a failed pickup (R505): the back-office decides.
 */
export const CANCEL_FEE_MILLIMES = 5000;

/** Fee of a new delivery attempt (R504, D7), millimes. Provisional: GOFAST answers, 6 Nov 2026: free. */
export const NEW_ATTEMPT_FEE_MILLIMES = 0;

/** Fee of the return to the sender after a failure (R504, R607, D7), millimes. Provisional: GOFAST answers, 6 Nov 2026. */
export const RETURN_FEE_MILLIMES = 5000;

/**
 * Weight gap tolerated between the declared and the measured weight (R208), in grams. Provisional:
 * GOFAST answers, 6 Nov 2026: 500 g while the declared weight is up to 5 kg, 10 % of it above.
 */
export const WEIGHT_TOLERANCE_FLAT_G = 500;
export const WEIGHT_TOLERANCE_FLAT_UP_TO_G = 5000;
export const WEIGHT_TOLERANCE_PERCENT = 10;

/** R801: a damage or a loss is reported within 48 h of the delivery or of the finding. Provisional: GOFAST answers, 6 Nov 2026 (docs/spec/reponses-gofast.md). */
export const CLAIM_REPORT_DELAY_HOURS = 48;

/**
 * R802: without a declared value, the compensation cap is 100 DT, in millimes. Provisional: GOFAST
 * answers, 6 Nov 2026. Shown on C07 only: no refund is ever computed in the client space.
 */
export const CLAIM_FLAT_CAP_MILLIMES = 100_000;

/** R804: a closed claim can be reopened for 30 days, then it is archived. Provisional: GOFAST answers, 6 Nov 2026. */
export const CLAIM_REOPEN_WINDOW_MS = 30 * 24 * HOUR;

/** R804: GOFAST answers a claim within 48 h (text of C07). Provisional: GOFAST answers, 6 Nov 2026. */
export const CLAIM_REPLY_DELAY_HOURS = 48;

/**
 * Claim attachments (H12): the file rule is shared (`packages/domain/src/attachments.ts`, size `MAX_ATTACHMENT_BYTES`),
 * at most 5 files. Provisional: GOFAST answers, 6 Nov 2026.
 */
export const CLAIM_ATTACHMENT_MAX_BYTES = MAX_ATTACHMENT_BYTES;
export const CLAIM_ATTACHMENT_MAX_FILES = 5;
export const CLAIM_ATTACHMENT_TYPES = ATTACHMENT_TYPES;
