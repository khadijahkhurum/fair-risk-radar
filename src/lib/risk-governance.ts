// Governance over the 1-5 register that sits beside the quantitative engine
// (audit G7), and the retention/erasure policy for the personal data in it
// (audit G8).
//
// G7's finding was not that the ordinal bridge exists — the audit called that
// "a defensible product decision". It was that the bridge was ungoverned:
//
//   1. The ALE -> 1-5 thresholds were not published, so "Impact 4" could not
//      be decoded, defended or compared across risks. Fixed in risk-rating.ts
//      by making the bands data and deriving the functions from them.
//   2. Once a human edited a score, nothing recorded that it had diverged from
//      the model, and nothing flagged it when the underlying simulation later
//      moved. Heatmap and ALE could silently contradict each other — precisely
//      the failure the Methodology page was written to escape.
//
// This module is the second half: pure predicates over stored values, so the
// rules are testable without a database and the API and UI cannot each invent
// their own version of "overridden".

export interface RatingPair {
  likelihood: number;
  impact: number;
}

/** What the model proposed, or null where no assessment has produced one. */
export type Suggestion = RatingPair | null;

/** True when a human value differs from what the model proposed. */
export function isOverridden(human: RatingPair, suggested: Suggestion): boolean {
  if (suggested === null) return false;
  return human.likelihood !== suggested.likelihood || human.impact !== suggested.impact;
}

/** How far apart two rating pairs are, in bands, on whichever axis moved most. */
export function bandDistance(a: RatingPair, b: RatingPair): number {
  return Math.max(Math.abs(a.likelihood - b.likelihood), Math.abs(a.impact - b.impact));
}

/**
 * Whether a newer assessment has moved the model's suggestion far enough from
 * the one the register was built against that the stored ordinal should be
 * revisited.
 *
 * A full band is the threshold because anything smaller is not expressible in
 * the ordinal anyway — re-flagging on a sub-band move would cry wolf on noise
 * that cannot change the score.
 */
export function suggestionIsStale(
  storedSuggestion: Suggestion,
  currentSuggestion: Suggestion,
  thresholdBands = 1
): boolean {
  if (storedSuggestion === null || currentSuggestion === null) return false;
  return bandDistance(storedSuggestion, currentSuggestion) >= thresholdBands;
}

export type JustificationCheck = { ok: true } | { ok: false; reason: string };

/**
 * An override without a reason is the thing G7 objected to: a number that
 * disagrees with the model and offers nothing an auditor can weigh.
 *
 * Note the asymmetry — a justification is required only when the human value
 * DIVERGES. Accepting the model's suggestion needs no defence, and demanding
 * one would train people to type "ok" into a mandatory box, which is worse
 * than no box at all.
 */
export function requiresJustification(
  human: RatingPair,
  suggested: Suggestion,
  justification: string | null | undefined,
  label = "rating"
): JustificationCheck {
  if (!isOverridden(human, suggested)) return { ok: true };
  const text = (justification ?? "").trim();
  if (text.length === 0) {
    return {
      ok: false,
      reason: `This ${label} differs from the model's suggestion of ${suggested!.likelihood}x${suggested!.impact}. Record why, so the divergence is defensible rather than merely present.`,
    };
  }
  if (text.length < 10) {
    return {
      ok: false,
      reason: "A justification needs to say something. Explain what the model is missing that you can see.",
    };
  }
  return { ok: true };
}

/** Rendered beside an overridden score, e.g. "Overridden — model suggests 3x4". */
export function overrideLabel(suggested: Suggestion): string | null {
  if (suggested === null) return null;
  return `Overridden — model suggests ${suggested.likelihood}x${suggested.impact}`;
}

// ── G8: retention and erasure ───────────────────────────────────────────────
//
// The finding: ownerName is free-text personal data, there is no DELETE
// anywhere, and the audit trail is append-only by design. Append-only is the
// RIGHT default — the gap was that no lawful erasure mechanism existed
// alongside it, which puts it in tension with GDPR Art. 17 and equivalents.
//
// The resolution is the auditor's: reference identities rather than embedding
// them. Risks and audit events carry an owner ID; the display name lives in
// one directory row that can be tombstoned. Erasing a person blanks the name
// everywhere at once WITHOUT rewriting a single historical record, so the hash
// chain stays valid and the erasure is itself auditable.

export interface RetentionRule {
  data: string;
  period: string;
  basis: string;
}

export const RETENTION_SCHEDULE: RetentionRule[] = [
  {
    data: "Risk assessments (simulation runs)",
    period: "7 years",
    basis:
      "Financial-services record-keeping norms; an assessment that fed a budget decision must outlive the budget cycle it justified.",
  },
  {
    data: "Control evidence uploads",
    period: "7 years",
    basis: "Matches the assessment period, since evidence is what an assessment's coverage figures rest on.",
  },
  {
    data: "Audit trail events",
    period: "7 years, never edited",
    basis:
      "Hash-chained and append-only. Personal data is referenced by ID rather than embedded, so erasure never requires rewriting history.",
  },
  {
    data: "Risk owner directory",
    period: "Until erased on request",
    basis:
      "The only place a person's name is stored. Tombstoning it removes the name from every risk and every historical record at once.",
  },
  {
    data: "What-if simulations",
    period: "Not retained",
    basis: "Computed on request and never persisted. There is nothing to erase.",
  },
  {
    data: "Sessions",
    period: "12 hours",
    basis: "Expired rows are deleted on next use rather than by a scheduled job.",
  },
];

/** What a tombstoned owner renders as, everywhere. */
export const ERASED_OWNER_LABEL = "[erased]";

export function ownerDisplayName(owner: { displayName: string; erasedAt: Date | string | null }): string {
  return owner.erasedAt ? ERASED_OWNER_LABEL : owner.displayName;
}
