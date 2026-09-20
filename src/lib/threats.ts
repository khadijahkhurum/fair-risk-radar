// Threat-type modifiers applied on top of an industry Scenario's baseline
// Threat Event Frequency and Vulnerability.
//
// Relative frequency/success ordering is informed by Verizon's 2025 Data
// Breach Investigations Report (already cited in README as a methodology
// source) but the exact multipliers below are modeling assumptions, not
// measured values — labeled as such in the UI.
export interface Threat {
  id: string;
  name: string;
  description: string;
  tefMultiplier: number; // scales the scenario's tefLambda
  vulnerabilityMultiplier: number; // scales the scenario's vulnerability
}

export const threats: Threat[] = [
  {
    id: "phishing-bec",
    name: "Phishing / Business Email Compromise",
    description: "Highest-frequency initial access vector; moderate success rate against typical controls.",
    tefMultiplier: 1.6,
    vulnerabilityMultiplier: 1.0,
  },
  {
    id: "ransomware",
    name: "Ransomware",
    description: "Frequent and increasingly automated; elevated success rate once a foothold is gained.",
    tefMultiplier: 1.3,
    vulnerabilityMultiplier: 1.2,
  },
  {
    id: "cloud-misconfiguration",
    name: "Cloud Misconfiguration",
    description: "Common given complex cloud estates; high success rate because misconfigurations are passive exposure, not an active bypass.",
    tefMultiplier: 1.1,
    vulnerabilityMultiplier: 1.3,
  },
  {
    id: "insider-threat",
    name: "Insider Threat",
    description: "Rare relative to external threats, but high success rate since legitimate access bypasses perimeter controls.",
    tefMultiplier: 0.4,
    vulnerabilityMultiplier: 1.4,
  },
  {
    id: "supply-chain",
    name: "Third-Party / Supply Chain Compromise",
    description: "Less frequent but disproportionately damaging; vendor-side controls are outside direct control.",
    tefMultiplier: 0.6,
    vulnerabilityMultiplier: 1.5,
  },
];
