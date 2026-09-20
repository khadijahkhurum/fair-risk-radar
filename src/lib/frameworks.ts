// Compliance frameworks available in the framework selector, and which
// Control field each one reads from.
export const frameworks = [
  { id: "nist_csf", label: "NIST CSF 2.0", field: "nistCsf" as const },
  { id: "iso27001", label: "ISO/IEC 27001:2022", field: "iso27001" as const },
  { id: "soc2", label: "SOC 2 (Trust Services Criteria)", field: "soc2" as const },
  { id: "pci_dss", label: "PCI DSS v4.0", field: "pciDss" as const },
  { id: "eu_ai_act", label: "EU AI Act", field: "euAiAct" as const },
  { id: "owasp_llm", label: "OWASP LLM Top 10", field: "owaspLlm" as const },
] as const;

export type FrameworkId = (typeof frameworks)[number]["id"];

export function frameworkField(id: string) {
  return frameworks.find((f) => f.id === id)?.field ?? "nistCsf";
}
