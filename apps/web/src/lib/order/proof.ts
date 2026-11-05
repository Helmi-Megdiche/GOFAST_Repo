import { PROOF_VALUE_THRESHOLD_MILLIMES } from "./constants";

/** Proof level of a parcel (ADR-1, section 4 table), weakest to strongest. */
export type ProofLevel =
  "codeOrPhotoWithPosition" | "codeOrSignatureAndPhoto" | "codeOrAgentPhoneWithSignatureAndPhoto";

/**
 * Proof of delivery shown on W15 (rules from the cahier):
 * - ordinary parcel, no COD: recipient code, or photo with position
 * - fragile parcel: code, or signature and photo
 * - COD: code; failing that, an agent validates by phone, with signature and photo
 * COD wins over fragile (it is the stricter rule).
 */
export type ProofRule = "codeOrPhotoPosition" | "codeOrSignaturePhoto" | "codeElseAgentPhone";

export type ProofResult = {
  rule: ProofRule;
  /**
   * Above (strictly, as the cahier says) the declared-value threshold a stronger proof may apply. FastGo has not fixed the
   * threshold (null), so this stays false and there is no UI for it. Question listed in the PR.
   */
  aboveValueThreshold: boolean;
};

export function proofFor(
  parcel: { fragile: boolean; cod: boolean; declaredValueMillimes: number | null },
  threshold: number | null = PROOF_VALUE_THRESHOLD_MILLIMES,
): ProofResult {
  const rule: ProofRule = parcel.cod
    ? "codeElseAgentPhone"
    : parcel.fragile
      ? "codeOrSignaturePhoto"
      : "codeOrPhotoPosition";
  const aboveValueThreshold =
    threshold != null &&
    parcel.declaredValueMillimes != null &&
    parcel.declaredValueMillimes > threshold;
  return { rule, aboveValueThreshold };
}
