// Industry loss-profile scenarios for the FAIR model.
//
// Loss magnitude follows FAIR's actual taxonomy, not a single flat range:
// Primary Loss (detection/escalation, incident response, notification — costs
// that are certain once a loss event occurs) plus a Secondary Loss (lost
// business, reputational/customer churn) that only materializes some
// fraction of the time.
//
// The combined totals (what primaryLossMode + secondaryLossProbability *
// secondaryLossMode average out to) are calibrated to IBM Security's *Cost
// of a Data Breach Report 2025* per-industry average total cost — same
// anchor as before. The SPLIT between primary/secondary is a modeled
// assumption, informed by IBM's historically published cost-category
// mix (detection & escalation + post-breach response + notification have
// consistently summed to ~70% of total cost, with lost business the
// remaining ~30% — see README's Data sources): PRIMARY_SHARE = 0.71 of the
// total, and a secondary loss that, when it occurs (modeled at 70%
// probability — not every breach costs you customers), makes up the rest.
// Threat Event Frequency and Vulnerability remain explicit modeling
// assumptions, not measured — labeled as such in the dashboard's
// methodology panel.
export interface Scenario {
  id: string;
  name: string;
  industry: string;
  tefLambda: number; // modeled: mean threat events per year (Poisson)
  vulnerability: number; // modeled: P(threat event becomes a loss event)
  primaryLossMin: number; // sourced total x ~71%: detection/escalation + response + notification
  primaryLossMode: number;
  primaryLossMax: number;
  secondaryLossProbability: number; // modeled: P(lost-business impact occurs | loss event)
  secondaryLossMin: number; // sourced total x ~41.4%, conditional on occurring
  secondaryLossMode: number;
  secondaryLossMax: number;
  sourceNote: string;
}

export const scenarios: Scenario[] = [
  {
    id: "financial-services",
    name: "Financial Services",
    industry: "Financial Services",
    tefLambda: 12,
    vulnerability: 0.22,
    primaryLossMin: 2_769_000,
    primaryLossMode: 4_189_000,
    primaryLossMax: 5_822_000,
    secondaryLossProbability: 0.7,
    secondaryLossMin: 1_616_000,
    secondaryLossMode: 2_444_000,
    secondaryLossMax: 3_397_000,
    sourceNote:
      "Loss magnitude: IBM Cost of a Data Breach Report 2025, Financial sector average, split into Primary/Secondary Loss per FAIR. TEF and vulnerability are modeling assumptions.",
  },
  {
    id: "healthcare",
    name: "Healthcare",
    industry: "Healthcare",
    tefLambda: 9,
    vulnerability: 0.28,
    primaryLossMin: 4_828_000,
    primaryLossMode: 6_937_000,
    primaryLossMax: 9_585_000,
    secondaryLossProbability: 0.7,
    secondaryLossMin: 2_817_000,
    secondaryLossMode: 4_048_000,
    secondaryLossMax: 5_593_000,
    sourceNote:
      "Loss magnitude: IBM Cost of a Data Breach Report 2025, Healthcare average (highest of all sectors), split into Primary/Secondary Loss per FAIR. TEF and vulnerability are modeling assumptions.",
  },
  {
    id: "technology",
    name: "Technology / SaaS",
    industry: "Technology",
    tefLambda: 15,
    vulnerability: 0.18,
    primaryLossMin: 2_272_000,
    primaryLossMode: 3_465_000,
    primaryLossMax: 4_899_000,
    secondaryLossProbability: 0.7,
    secondaryLossMin: 1_326_000,
    secondaryLossMode: 2_022_000,
    secondaryLossMax: 2_859_000,
    sourceNote:
      "Loss magnitude: IBM Cost of a Data Breach Report 2025, Technology sector average, split into Primary/Secondary Loss per FAIR. TEF and vulnerability are modeling assumptions.",
  },
  {
    id: "retail",
    name: "Retail / E-commerce",
    industry: "Retail",
    tefLambda: 14,
    vulnerability: 0.2,
    primaryLossMin: 1_704_000,
    primaryLossMode: 2_471_000,
    primaryLossMax: 3_621_000,
    secondaryLossProbability: 0.7,
    secondaryLossMin: 994_000,
    secondaryLossMode: 1_442_000,
    secondaryLossMax: 2_113_000,
    sourceNote:
      "Loss magnitude: IBM Cost of a Data Breach Report 2025, Retail sector average, split into Primary/Secondary Loss per FAIR. TEF and vulnerability are modeling assumptions.",
  },
];

// Used wherever a single "typical loss" number is needed (e.g. a default
// risk-tolerance seed value) — the expected total per loss event.
export function expectedLossPerEvent(scenario: Pick<Scenario, "primaryLossMode" | "secondaryLossProbability" | "secondaryLossMode">): number {
  return scenario.primaryLossMode + scenario.secondaryLossProbability * scenario.secondaryLossMode;
}
