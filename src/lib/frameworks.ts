// Compliance frameworks available in the framework selector, which Control
// field each one reads from, and — critically — how large each framework
// actually is (audit G2).
//
// G2 was the finding most likely to cause real harm: the Control Posture page
// rendered "NIST CSF 2.0 — 57%" beside a named regulatory framework, where the
// 57% was the mean coverage of the 8 controls in THIS catalogue. Every reader
// parses that as coverage OF THAT FRAMEWORK. Screenshotted into a board deck,
// a vendor questionnaire or an insurer's underwriting pack, it is a material
// misstatement of compliance posture.
//
// The fix is to separate the two dimensions and never collapse them:
//
//   Scope          how much of the framework this catalogue even addresses
//   Implementation how well the mapped controls are actually run
//   Assessed       scope x implementation
//
// `population` is the framework's own requirement count, from its published
// text. Where a framework has no single meaningful denominator — the EU AI Act
// applies different obligations depending on a system's risk classification —
// it is null and the UI says scope is not quantified rather than inventing a
// number. A manufactured denominator would be the same error G2 describes,
// just in the other direction.
export const frameworks = [
  {
    id: "nist_csf",
    label: "NIST CSF 2.0",
    field: "nistCsf" as const,
    population: 106,
    unit: "subcategories",
    approximate: false,
    basis: "NIST CSF 2.0 Core (February 2024): 6 Functions, 22 Categories, 106 Subcategories.",
  },
  {
    id: "iso27001",
    label: "ISO/IEC 27001:2022",
    field: "iso27001" as const,
    population: 93,
    unit: "Annex A controls",
    approximate: false,
    basis: "ISO/IEC 27001:2022 Annex A — 93 controls across 4 themes.",
  },
  {
    id: "soc2",
    label: "SOC 2 (Trust Services Criteria)",
    field: "soc2" as const,
    population: 33,
    unit: "common criteria",
    approximate: false,
    basis:
      "TSC 2017 (rev. 2022), Common Criteria CC1–CC9. Counted as criteria, not points of focus — points of focus are illustrative guidance, not requirements to be met.",
  },
  {
    id: "pci_dss",
    label: "PCI DSS v4.0",
    field: "pciDss" as const,
    population: 300,
    unit: "sub-requirements",
    approximate: true,
    basis:
      "PCI DSS v4.0 — approximately 300 sub-requirements across 12 principal requirements. Counted at sub-requirement level because that is the level this catalogue maps to; counting the 12 principal requirements instead would flatter the scope figure roughly 25-fold.",
  },
  {
    id: "eu_ai_act",
    label: "EU AI Act",
    field: "euAiAct" as const,
    population: null,
    unit: "obligations",
    approximate: false,
    basis:
      "Obligations depend on a system's risk classification (prohibited, high-risk, limited, minimal), so there is no single requirement population to divide by. Scope is deliberately not quantified rather than given a manufactured denominator.",
  },
  {
    id: "owasp_llm",
    label: "OWASP LLM Top 10",
    field: "owaspLlm" as const,
    population: 10,
    unit: "risk categories",
    approximate: false,
    basis: "OWASP Top 10 for LLM Applications — 10 risk categories.",
  },
] as const;

export type FrameworkId = (typeof frameworks)[number]["id"];

export function frameworkField(id: string) {
  return frameworks.find((f) => f.id === id)?.field ?? "nistCsf";
}

export function frameworkMeta(id: string) {
  return frameworks.find((f) => f.id === id) ?? null;
}
