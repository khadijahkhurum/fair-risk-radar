// Parameter provenance register (audit G9).
//
// The Methodology page's own standard is "a number without a source is an
// opinion", and it applies that rigorously to control coverage — every
// coverage figure carries a DEMO / MANUAL / AWS_CONFIG tag. It did not apply
// the same standard to the model's own parameters. "IBM Cost of a Data Breach
// Report" appeared with no year or edition; the threat-frequency multipliers
// and the 0.7 secondary-loss probability were cited nowhere at all.
//
// This is the register that closes that. The important column is `basis`:
// every row says whether the number is SOURCED from a publication, DERIVED
// from a sourced number, or a JUDGEMENT call with nothing behind it but
// reasoning. The judgement rows are the honest part — the audit singled out
// the 70% control cap as the model to follow precisely because the page
// already admitted that one was asserted rather than measured.
//
// This is data, not prose, so the Methodology page renders it and cannot drift
// from it, and a reviewer can diff it between versions.

export type ParameterBasis = "SOURCED" | "DERIVED" | "JUDGEMENT";

export interface ParameterProvenance {
  parameter: string;
  value: string;
  basis: ParameterBasis;
  /** Edition and section where a reader can check it, or why there is none. */
  source: string;
  /** How the stated value was arrived at from that source. */
  derivation: string;
  /** When a human last checked this against its source. */
  lastReviewed: string;
}

export const BASIS_LABEL: Record<ParameterBasis, string> = {
  SOURCED: "Sourced",
  DERIVED: "Derived",
  JUDGEMENT: "Judgement — unsourced",
};

export const BASIS_NOTE: Record<ParameterBasis, string> = {
  SOURCED: "Taken directly from a published figure that can be looked up.",
  DERIVED: "Computed from a sourced figure by a stated rule.",
  JUDGEMENT: "A modelling assumption. Nothing measures this — it is reasoning, and it can be wrong.",
};

export const PARAMETER_PROVENANCE: ParameterProvenance[] = [
  {
    parameter: "Loss magnitude, per sector",
    value: "Sector average total breach cost",
    basis: "SOURCED",
    source: "IBM Security, Cost of a Data Breach Report 2025 — per-industry average total cost",
    derivation:
      "The published per-sector average is the anchor for the combined Primary + expected Secondary loss.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "Primary / Secondary loss split",
    value: "71% primary, remainder secondary",
    basis: "DERIVED",
    source:
      "IBM Security, Cost of a Data Breach Report — published cost-category mix (detection & escalation, post-breach response, notification vs. lost business)",
    derivation:
      "Detection & escalation + post-breach response + notification have consistently summed to roughly 70% of total cost, with lost business the remainder. PRIMARY_SHARE = 0.71 of the sector total.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "secondaryLossProbability",
    value: "0.7",
    basis: "JUDGEMENT",
    source:
      "None. Previously undocumented, which is what audit finding G9 was about.",
    derivation:
      "Not every breach costs an organisation customers. 0.7 says roughly seven in ten loss events carry a lost-business component. It is a modelling assumption chosen to reflect that the secondary component is common but not certain; no published figure supports the specific value.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "Threat Event Frequency (tefLambda)",
    value: "9–14 events/year depending on sector",
    basis: "JUDGEMENT",
    source: "None. Frequency is not published in the loss-magnitude source.",
    derivation:
      "An all-cause sector frequency assumption. It drives the frequency side of every figure in the product and is not measured.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "Vulnerability",
    value: "0.20–0.30 depending on sector",
    basis: "JUDGEMENT",
    source: "None.",
    derivation:
      "The probability that a threat event becomes a loss event, before controls. A modelling assumption, not a measurement.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "Threat community multipliers (tefMultiplier)",
    value: "0.4–1.6 across the catalogue",
    basis: "JUDGEMENT",
    source:
      "Relative ordering informed by Verizon, Data Breach Investigations Report 2025. The specific values are not from it.",
    derivation:
      "The DBIR informs which communities are more or less frequent relative to each other; the numbers themselves are assigned judgement. Since audit M10 these are PARTITION weights — each community's share of the sector's all-cause frequency — so only their ratios matter, not their absolute size.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "Vulnerability multipliers",
    value: "1.0–1.5 across the catalogue",
    basis: "JUDGEMENT",
    source: "Relative ordering informed by Verizon DBIR 2025; values assigned.",
    derivation:
      "Reflects that some communities succeed more often once they act — an insider bypasses perimeter controls, a misconfiguration is passive exposure rather than an active bypass. Unlike the frequency multipliers these are NOT partitioned, because a success rate is not a shared budget.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "MAX_CONTROL_RISK_REDUCTION",
    value: "0.70",
    basis: "JUDGEMENT",
    source: "None, and deliberately labelled as such throughout.",
    derivation:
      "Controls mitigate but never eliminate risk, so full nominal coverage is capped at a 70% reduction in effective vulnerability rather than 100%. The cap is inside the parameter-set hash, so changing it invalidates every prior assessment — but nothing evidences the number itself.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "Risk-appetite bar",
    value: "10% of years may exceed tolerance",
    basis: "JUDGEMENT",
    source: "A convention chosen for this tool. Not a standard.",
    derivation:
      "Breaching a stated appetite in more than one year in ten is treated as failing it. An organisation with a real appetite statement should replace this with whatever its board signed.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "Insurance premium loading",
    value: "1.4x expected payout",
    basis: "JUDGEMENT",
    source: "None. A plausible mid-market cyber loading for a demo, not a quoted rate.",
    derivation:
      "Insurers charge above expected payout to cover capital, expenses and profit. The Risk Transfer page accepts a real premium instead, and should be given one before any figure there is relied on.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "AI evidence review — model",
    value: "claude-sonnet-4-5-20250929 (pinned)",
    basis: "JUDGEMENT",
    source: "None. A model choice, not a measured parameter.",
    derivation:
      "Pinned rather than floating, because this feature is the one non-reproducible component in the product and a drifting version on top of that would mean nobody could say what produced a stored finding. Changing it is a deliberate act recorded on the review rows it affects.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "AI evidence review — reproducibility",
    value: "Not reproducible",
    basis: "JUDGEMENT",
    source: "Inherent to language models.",
    derivation:
      "Unlike every simulation figure, an AI finding cannot be re-derived from a seed: the same file may produce different findings on a later run. Reviews are therefore stored as records rather than recomputed, and re-running creates a new row instead of overwriting. Findings never enter the risk model.",
    lastReviewed: "2026-09",
  },
  {
    parameter: "Loss distribution shape",
    value: "Triangular (min, mode, max)",
    basis: "JUDGEMENT",
    source: "None — a modelling choice.",
    derivation:
      "FAIR practitioners often prefer Beta-PERT for smoother tails. Triangular needs only min/mode/max with no shape parameter to tune, and sits within the same order of magnitude here. Chosen for defensibility over precision.",
    lastReviewed: "2026-09",
  },
];

/** Counts for the summary line — how much of this model is actually sourced. */
export function provenanceSummary(rows: ParameterProvenance[] = PARAMETER_PROVENANCE) {
  const counts = { SOURCED: 0, DERIVED: 0, JUDGEMENT: 0 } as Record<ParameterBasis, number>;
  for (const row of rows) counts[row.basis]++;
  return { ...counts, total: rows.length };
}
