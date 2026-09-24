// Per-framework coverage roll-up (audit G2, G3).
//
// Two dimensions, never collapsed into one number:
//
//   SCOPE          how much of the framework this catalogue addresses at all
//                  — distinct requirement references mapped / the framework's
//                  published requirement population.
//   IMPLEMENTATION how well the controls we DO map are actually run — the mean
//                  coverage across them. This is the number the sliders edit.
//   ASSESSED       scope x implementation. The only one of the three that can
//                  honestly sit next to a framework's name as "our coverage".
//
// The old single percentage was implementation presented as if it were
// assessed coverage, which overstated posture by more than an order of
// magnitude for every framework in the catalogue.
import type { ControlRow, FrameworkColumn } from "@/components/ControlTable";
import { frameworkMeta } from "./frameworks";

export interface FrameworkCoverage {
  id: string;
  label: string;
  field: FrameworkColumn["field"];
  /** Controls in this catalogue that map to the framework at all. */
  mappedCount: number;
  controlIds: string[];
  /** Distinct requirement references touched — two controls can cite one requirement. */
  distinctReferences: number;
  /** The framework's own requirement count, or null where it has no single denominator. */
  population: number | null;
  unit: string;
  approximate: boolean;
  scopePct: number | null;
  /** Mean coverage across the mapped controls. Null when nothing maps. */
  implementationPct: number | null;
  assessedPct: number | null;
  /** Alias for implementationPct — what the per-framework slider edits. */
  coveragePct: number | null;
  /**
   * How many of the mapped controls carry a figure set specifically for this
   * framework rather than inheriting the base. Surfaced so a reader can tell a
   * framework that has been assessed on its own terms from one that is simply
   * showing the deployment.
   */
  scopedCount: number;
}

// One definition of "this control maps to this framework", used by both the
// roll-up and the per-framework bulk setter so they can't disagree about
// which controls belong to a framework.
export function mapsToFramework(control: ControlRow, field: FrameworkColumn["field"]): boolean {
  const cell = control[field];
  return cell !== undefined && cell !== null && String(cell).trim() !== "" && String(cell) !== "N/A";
}

/**
 * The coverage figure that counts for this control WITHIN this framework.
 *
 * A framework-scoped figure wins where one has been set; otherwise the base
 * figure applies. This is what makes the per-framework sliders independent:
 * moving one framework writes rows tagged with that framework, so it cannot
 * change what any other framework resolves to.
 *
 * Independence is not a licence to publish contradictory numbers. The scoped
 * figure means "coverage of this control as THIS framework scopes it" — PCI
 * DSS 8.4.2 asks for MFA across the cardholder data environment, ISO/IEC 27001
 * A.8.5 asks for it everywhere, and one rollout can be 100% of the former and
 * 60% of the latter. Two different denominators, not two different truths.
 *
 * The base figure is the deployment itself, and it is the ONLY one the FAIR
 * engine reads. A scoped figure must never reach the simulation: an attacker
 * does not care which framework you were looking at.
 */
export function resolvedCoverage(control: ControlRow, frameworkId: string): number {
  const scoped = control.frameworkCoveragePct?.[frameworkId];
  return scoped !== undefined ? scoped : control.coveragePct ?? 0;
}

/** True when this control carries a figure specific to this framework. */
export function hasScopedCoverage(control: ControlRow, frameworkId: string): boolean {
  return control.frameworkCoveragePct?.[frameworkId] !== undefined;
}

export function coverageByFramework(
  controls: ControlRow[],
  frameworks: readonly FrameworkColumn[]
): FrameworkCoverage[] {
  return frameworks.map((f) => {
    const mapped = controls.filter((c) => mapsToFramework(c, f.field));
    const references = new Set(mapped.map((c) => String(c[f.field]).trim()));
    const meta = frameworkMeta(f.id);
    const population = meta?.population ?? null;

    // Resolved, not base: a framework's implementation is the mean of what each
    // mapped control counts for WITHIN this framework.
    const implementationPct =
      mapped.length > 0
        ? mapped.reduce((sum, c) => sum + resolvedCoverage(c, f.id), 0) / mapped.length
        : null;
    const scopedCount = mapped.filter((c) => hasScopedCoverage(c, f.id)).length;
    const scopePct = population && population > 0 ? (references.size / population) * 100 : null;
    const assessedPct =
      scopePct !== null && implementationPct !== null ? (scopePct * implementationPct) / 100 : null;

    return {
      id: f.id,
      label: f.label,
      field: f.field,
      mappedCount: mapped.length,
      controlIds: mapped.map((c) => c.id).sort(),
      distinctReferences: references.size,
      population,
      unit: meta?.unit ?? "requirements",
      approximate: meta?.approximate ?? false,
      scopePct,
      implementationPct,
      assessedPct,
      coveragePct: implementationPct,
      scopedCount,
    };
  });
}

/**
 * Mean IMPLEMENTATION across frameworks — how well the mapped controls are run.
 *
 * Equal weight per framework, so whichever framework happens to have the most
 * mappings cannot quietly dominate. This is NOT a statement of compliance
 * coverage; see averageAssessed below, and never present this one beside a
 * framework's name on its own.
 */
export function averageOfFrameworks(rows: FrameworkCoverage[]): number {
  const scored = rows.filter((r) => r.implementationPct !== null);
  if (scored.length === 0) return 0;
  return scored.reduce((sum, r) => sum + (r.implementationPct ?? 0), 0) / scored.length;
}

/** Mean ASSESSED coverage — scope x implementation, across frameworks that have a denominator. */
export function averageAssessed(rows: FrameworkCoverage[]): number | null {
  const scored = rows.filter((r) => r.assessedPct !== null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, r) => sum + (r.assessedPct ?? 0), 0) / scored.length;
}

// Frameworks whose mapped control set is IDENTICAL to this one's (audit G3).
// Coverage is stored per control, not per control-per-framework, so two
// frameworks mapping the same controls share one IMPLEMENTATION figure by
// definition. Their SCOPE still differs, because their requirement
// populations differ — which is why splitting the two dimensions also fixes
// the "four frameworks can never disagree" complaint.
export function identicalSetPeers(row: FrameworkCoverage, all: FrameworkCoverage[]): string[] {
  if (row.controlIds.length === 0) return [];
  const key = row.controlIds.join("|");
  return all.filter((o) => o.id !== row.id && o.controlIds.join("|") === key).map((o) => o.label);
}
