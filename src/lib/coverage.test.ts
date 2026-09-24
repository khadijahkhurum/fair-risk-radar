import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coverageByFramework,
  averageOfFrameworks,
  averageAssessed,
  resolvedCoverage,
  hasScopedCoverage,
} from "./coverage";
import { frameworks } from "./frameworks";

// Structural stand-in for ControlRow — this suite is about the arithmetic,
// not about the table component.
interface ControlRow {
  id: string;
  name: string;
  category: string;
  nistCsf: string;
  iso27001: string;
  soc2: string;
  pciDss: string;
  euAiAct: string;
  owaspLlm: string;
  coveragePct?: number;
  frameworkCoveragePct?: Record<string, number>;
}

const columns = frameworks.map((f) => ({ id: f.id, label: f.label, field: f.field }));

function control(id: string, coveragePct: number, over: Partial<ControlRow> = {}): ControlRow {
  return {
    id,
    name: id,
    category: "test",
    nistCsf: "PR.AA-03",
    iso27001: "A.8.5",
    soc2: "CC6.1",
    pciDss: "8.4.2",
    euAiAct: "N/A",
    owaspLlm: "N/A",
    coveragePct,
    ...over,
  } as ControlRow;
}

test("G2 — scope, implementation and assessed are three different numbers", () => {
  const rows = coverageByFramework([control("a", 57)], columns);
  const nist = rows.find((r) => r.id === "nist_csf")!;
  assert.equal(nist.implementationPct, 57);
  // One distinct subcategory out of 106.
  assert.ok(Math.abs((nist.scopePct ?? 0) - (1 / 106) * 100) < 1e-9);
  // Assessed is the product, and is far smaller than implementation alone.
  assert.ok(Math.abs((nist.assessedPct ?? 0) - ((1 / 106) * 100 * 57) / 100) < 1e-9);
  assert.ok((nist.assessedPct ?? 0) < (nist.implementationPct ?? 0) / 10);
});

test("G2 — distinct references are counted, not control rows", () => {
  // Two controls citing the SAME subcategory is one subcategory of scope.
  const rows = coverageByFramework([control("a", 50), control("b", 90)], columns);
  const nist = rows.find((r) => r.id === "nist_csf")!;
  assert.equal(nist.mappedCount, 2);
  assert.equal(nist.distinctReferences, 1);
  assert.equal(nist.implementationPct, 70);
});

test("G3 — frameworks sharing a control set still differ, because their populations differ", () => {
  const rows = coverageByFramework([control("a", 60)], columns);
  const nist = rows.find((r) => r.id === "nist_csf")!;
  const iso = rows.find((r) => r.id === "iso27001")!;
  // Same controls, so the same implementation...
  assert.equal(nist.implementationPct, iso.implementationPct);
  // ...but 1/106 is not 1/93, so scope and assessed coverage diverge.
  assert.notEqual(nist.scopePct, iso.scopePct);
  assert.notEqual(nist.assessedPct, iso.assessedPct);
});

test("a framework with no published denominator reports no scope rather than a made-up one", () => {
  const rows = coverageByFramework([control("a", 60, { euAiAct: "Art. 12 (Record-Keeping)" })], columns);
  const eu = rows.find((r) => r.id === "eu_ai_act")!;
  assert.equal(eu.population, null);
  assert.equal(eu.scopePct, null);
  assert.equal(eu.assessedPct, null);
  // Implementation is still knowable and still reported.
  assert.equal(eu.implementationPct, 60);
});

test("unmapped frameworks contribute nothing rather than zero-dragging the average", () => {
  const rows = coverageByFramework([control("a", 80)], columns);
  const owasp = rows.find((r) => r.id === "owasp_llm")!;
  assert.equal(owasp.mappedCount, 0);
  assert.equal(owasp.implementationPct, null);
  // The average is over scored frameworks only.
  assert.equal(averageOfFrameworks(rows), 80);
});

test("assessed average is far below implementation average — that is the point", () => {
  const rows = coverageByFramework([control("a", 80)], columns);
  const impl = averageOfFrameworks(rows);
  const assessed = averageAssessed(rows)!;
  assert.ok(assessed < impl / 10, `assessed ${assessed} vs implementation ${impl}`);
});

// ---------------------------------------------------------------------------
// Framework-scoped coverage.
//
// The property these lock down: a figure set for one framework changes that
// framework and NOTHING else. The reason the feature is defensible at all is
// that a scoped figure is a different DENOMINATOR, not a different truth — PCI
// DSS 8.4.2 asks for MFA across the cardholder data environment, ISO/IEC 27001
// A.8.5 asks for it everywhere, and one rollout can be 100% of the first and
// 60% of the second.
// ---------------------------------------------------------------------------

test("resolution — a scoped figure wins, and everything else falls back to base", () => {
  const c = control("mfa", 60, { frameworkCoveragePct: { pci_dss: 100 } });
  assert.equal(resolvedCoverage(c, "pci_dss"), 100, "scoped wins where set");
  assert.equal(resolvedCoverage(c, "iso27001"), 60, "unscoped falls back to base");
  assert.equal(hasScopedCoverage(c, "pci_dss"), true);
  assert.equal(hasScopedCoverage(c, "iso27001"), false);
});

test("resolution — a scoped ZERO is a figure, not an absence", () => {
  // The bug this prevents: `scoped || base` would treat a deliberate 0% as
  // unset and silently report the base instead, which is the one direction an
  // assessment must never drift.
  const c = control("mfa", 80, { frameworkCoveragePct: { pci_dss: 0 } });
  assert.equal(resolvedCoverage(c, "pci_dss"), 0);
});

test("THE POINT — scoping one framework moves only that framework", () => {
  // One control mapped to NIST, ISO, SOC 2 and PCI at once, so before scoping
  // all four necessarily agree.
  const before = coverageByFramework([control("mfa", 60)], columns);
  const pctOf = (rows: typeof before, id: string) =>
    rows.find((r) => r.id === id)!.implementationPct;

  assert.equal(pctOf(before, "nist_csf"), 60);
  assert.equal(pctOf(before, "iso27001"), 60);
  assert.equal(pctOf(before, "soc2"), 60);
  assert.equal(pctOf(before, "pci_dss"), 60);

  const after = coverageByFramework(
    [control("mfa", 60, { frameworkCoveragePct: { pci_dss: 100 } })],
    columns
  );
  assert.equal(pctOf(after, "pci_dss"), 100, "the framework that was set moves");
  assert.equal(pctOf(after, "nist_csf"), 60, "a framework sharing the control does NOT");
  assert.equal(pctOf(after, "iso27001"), 60);
  assert.equal(pctOf(after, "soc2"), 60);
});

test("scoping is per framework AND per control, so a partial override is a mean", () => {
  const rows = coverageByFramework(
    [
      control("a", 40, { frameworkCoveragePct: { soc2: 100 } }),
      control("b", 40), // no scoped figure — contributes its base
    ],
    columns
  );
  // SOC 2 sees 100 and 40; every other framework still sees 40 and 40.
  assert.equal(rows.find((r) => r.id === "soc2")!.implementationPct, 70);
  assert.equal(rows.find((r) => r.id === "nist_csf")!.implementationPct, 40);
});

test("scopedCount says whether a framework was assessed on its own terms", () => {
  const rows = coverageByFramework(
    [control("a", 40, { frameworkCoveragePct: { soc2: 100 } }), control("b", 40)],
    columns
  );
  assert.equal(rows.find((r) => r.id === "soc2")!.scopedCount, 1);
  assert.equal(rows.find((r) => r.id === "nist_csf")!.scopedCount, 0);
});

test("assessed coverage still multiplies by scope, so independence cannot inflate it", () => {
  // Setting PCI to 100% implementation must not make PCI look 100% covered:
  // the catalogue still only touches 1 of ~300 sub-requirements.
  const rows = coverageByFramework(
    [control("mfa", 60, { frameworkCoveragePct: { pci_dss: 100 } })],
    columns
  );
  const pci = rows.find((r) => r.id === "pci_dss")!;
  assert.equal(pci.implementationPct, 100);
  assert.ok((pci.assessedPct ?? 0) < 1, "scope dominates: ~1/300 of the framework");
});
