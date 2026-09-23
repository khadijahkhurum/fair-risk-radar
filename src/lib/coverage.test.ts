import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageByFramework, averageOfFrameworks, averageAssessed } from "./coverage";
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
