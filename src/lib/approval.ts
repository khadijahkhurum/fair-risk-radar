// Assessment sign-off (audit G4).
//
// "Nothing distinguishes a scratch run from an approved assessment" was the
// finding. An APPROVED state alone would not fix it — a button that always
// says yes is not a control. The decision logic lives here, pure and tested,
// so the four refusals are the artefact rather than the button.
//
// Deliberately NOT modelled: multi-step or quorum approval, delegation, and
// withdrawal of an approval. A sign-off that can be taken back silently is
// not a sign-off; superseding it means running and approving a new
// assessment, which leaves both in the hash-chained trail.
import type { Role } from "./roles";
import { atLeast } from "./roles";

export const APPROVER_ROLE: Role = "ADMIN";

export interface ApprovalSubject {
  status: "DRAFT" | "APPROVED";
  /** Who ran the simulation. Null on rows written before this was recorded. */
  runById: string | null;
  /** Content hash of the parameter set the figures were computed from. */
  parameterSetHash: string | null;
}

export interface Approver {
  id: string;
  role: Role;
}

export type ApprovalCheck =
  | { ok: true }
  | { ok: false; code: ApprovalRefusal; reason: string };

export type ApprovalRefusal =
  | "NOT_APPROVER"
  | "ALREADY_APPROVED"
  | "SELF_APPROVAL"
  | "NOT_REPRODUCIBLE";

/**
 * @param subject       the assessment being signed off
 * @param approver      the user attempting it
 * @param reproducible  whether the stored parameter-set hash still matches the
 *                      live one — passed in rather than computed here so this
 *                      module stays free of node:crypto and testable anywhere
 */
export function canApprove(
  subject: ApprovalSubject,
  approver: Approver,
  reproducible: boolean
): ApprovalCheck {
  if (!atLeast(approver.role, APPROVER_ROLE)) {
    return {
      ok: false,
      code: "NOT_APPROVER",
      reason: "Only an administrator can sign off an assessment.",
    };
  }
  if (subject.status === "APPROVED") {
    return {
      ok: false,
      code: "ALREADY_APPROVED",
      reason:
        "This assessment is already approved. An approval is immutable — supersede it by running and approving a new assessment.",
    };
  }
  // Segregation of duties. An analyst who can both produce a number and sign
  // it off has produced nothing an auditor can rely on, however senior they
  // are — which is why this check comes after the role check rather than
  // being waived by it.
  if (subject.runById !== null && subject.runById === approver.id) {
    return {
      ok: false,
      code: "SELF_APPROVAL",
      reason:
        "You ran this assessment, so you cannot also approve it. Sign-off has to come from someone other than the person who produced the figures.",
    };
  }
  // The whole point of an approval is that it attests to specific numbers. If
  // the parameters have moved since the run, the numbers can no longer be
  // re-derived, so there is nothing an approval could honestly attest to.
  if (!reproducible) {
    return {
      ok: false,
      code: "NOT_REPRODUCIBLE",
      reason:
        "The model parameters have changed since this assessment ran, so its figures can no longer be re-derived from its seed. Re-run it against the current parameter set, then approve that.",
    };
  }
  return { ok: true };
}
