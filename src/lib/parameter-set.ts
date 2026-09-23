// Model parameter-set identity (audit G4).
//
// The auditor asked for scenario parameters to be versioned as immutable rows
// with effectiveFrom / supersededBy, so an old assessment resolves against the
// parameters that were live when it ran.
//
// This does the same job differently, and the difference is deliberate. The
// parameters are not mutable runtime state — they are source code, already
// immutably versioned by git. Copying them into database rows would add a
// second source of truth that can drift from the first, and drift is the
// failure this control exists to prevent. Instead every assessment carries a
// CONTENT HASH of the exact parameter set it was computed from. A hash cannot
// disagree with the data it was taken over, and it answers the question an
// auditor actually asks — "were these the numbers in force when this ran?" —
// without a migration every time a figure is recalibrated.
//
// What it does NOT do: recover the old parameters. If the hash no longer
// matches, the assessment is flagged as non-reproducible rather than silently
// re-derived against today's values. Saying "this can no longer be reproduced"
// is a true and useful answer; quietly producing a different number is not.
//
// ponytail: single current hash, no registry of historical sets. Add a
// `parameter_set` table keyed by hash (storing the full canonical JSON) when
// someone needs to re-run a superseded assessment rather than merely detect
// that it is superseded — git tags cover it until then.
import { createHash } from "node:crypto";
import { canonicalJson } from "./audit-hash";
import { scenarios } from "./scenarios";
import { threats } from "./threats";
import { MAX_CONTROL_RISK_REDUCTION, ENGINE } from "./fair";

/**
 * Everything whose value changes the numbers the engine produces. The control
 * cap belongs here as much as the loss distributions do: it is a modelling
 * assumption that moves every figure on the page.
 */
const PARAMETER_SET = {
  scenarios,
  threats,
  maxControlRiskReduction: MAX_CONTROL_RISK_REDUCTION,
} as const;

/**
 * Truncated to 16 base64url characters (96 bits). This is a change detector,
 * not a security boundary — nobody is attacking it, and a short hash is one an
 * auditor can read off a PDF footer and compare by eye.
 */
export const PARAMETER_SET_HASH: string = createHash("sha256")
  .update(canonicalJson(PARAMETER_SET))
  .digest("base64url")
  .slice(0, 16);

/** The full stamp that goes on every assessment row, audit event and export. */
export const MODEL_STAMP = {
  engineVersion: ENGINE.version,
  parameterSetVersion: ENGINE.parameterSetVersion,
  parameterSetHash: PARAMETER_SET_HASH,
  commit: ENGINE.commit,
} as const;

/**
 * Whether a stored assessment was computed from the parameter set in force
 * today, and can therefore be re-derived from its seed.
 *
 * Rows written before this column existed carry "unknown". Those are treated
 * as NOT reproducible, which is the honest reading: the parameters at the time
 * were never recorded, so nothing can attest to them.
 */
export function isReproducible(storedHash: string | null | undefined): boolean {
  return storedHash === PARAMETER_SET_HASH;
}
