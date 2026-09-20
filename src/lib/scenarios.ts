// Industry loss-profile scenarios for the FAIR model.
//
// Loss magnitude (lossMin/lossMode/lossMax) is calibrated to IBM Security's
// *Cost of a Data Breach Report 2025* per-industry average total cost.
// Threat Event Frequency (tefLambda) and Vulnerability are NOT published at
// this granularity anywhere — they are explicit modeling assumptions, tuned
// to be directionally reasonable, not measured. Both are labeled as such in
// the dashboard's methodology panel (see `sourced` field on each factor
// returned by the API — src/app/api/risk/route.ts).
export interface Scenario {
  id: string;
  name: string;
  industry: string;
  tefLambda: number; // modeled: mean threat events per year (Poisson)
  vulnerability: number; // modeled: P(threat event becomes a loss event)
  lossMin: number; // sourced: IBM 2025, low end of industry range
  lossMode: number; // sourced: IBM 2025, industry average total cost
  lossMax: number; // sourced: IBM 2025, high end of industry range
  sourceNote: string;
}

export const scenarios: Scenario[] = [
  {
    id: "financial-services",
    name: "Financial Services",
    industry: "Financial Services",
    tefLambda: 12,
    vulnerability: 0.22,
    lossMin: 3_900_000,
    lossMode: 5_900_000,
    lossMax: 8_200_000,
    sourceNote:
      "Loss magnitude: IBM Cost of a Data Breach Report 2025, Financial sector average. TEF and vulnerability are modeling assumptions.",
  },
  {
    id: "healthcare",
    name: "Healthcare",
    industry: "Healthcare",
    tefLambda: 9,
    vulnerability: 0.28,
    lossMin: 6_800_000,
    lossMode: 9_770_000,
    lossMax: 13_500_000,
    sourceNote:
      "Loss magnitude: IBM Cost of a Data Breach Report 2025, Healthcare average (highest of all sectors). TEF and vulnerability are modeling assumptions.",
  },
  {
    id: "technology",
    name: "Technology / SaaS",
    industry: "Technology",
    tefLambda: 15,
    vulnerability: 0.18,
    lossMin: 3_200_000,
    lossMode: 4_880_000,
    lossMax: 6_900_000,
    sourceNote:
      "Loss magnitude: IBM Cost of a Data Breach Report 2025, Technology sector average. TEF and vulnerability are modeling assumptions.",
  },
  {
    id: "retail",
    name: "Retail / E-commerce",
    industry: "Retail",
    tefLambda: 14,
    vulnerability: 0.2,
    lossMin: 2_400_000,
    lossMode: 3_480_000,
    lossMax: 5_100_000,
    sourceNote:
      "Loss magnitude: IBM Cost of a Data Breach Report 2025, Retail sector average. TEF and vulnerability are modeling assumptions.",
  },
];
