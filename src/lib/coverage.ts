// Per-framework coverage roll-up.
//
// A control counts toward a framework only if it actually maps to it (its
// mapping cell isn't "N/A") — otherwise EU AI Act would be dragged down by
// the seven controls that have nothing to do with it.
import type { ControlRow, FrameworkColumn } from "@/components/ControlTable";

export interface FrameworkCoverage {
  id: string;
  label: string;
  field: FrameworkColumn["field"];
  mappedCount: number;
  coveragePct: number | null; // null when no control maps to this framework
}

// One definition of "this control maps to this framework", used by both the
// roll-up and the per-framework bulk setter so they can't disagree about
// which controls belong to a framework.
export function mapsToFramework(control: ControlRow, field: FrameworkColumn["field"]): boolean {
  const cell = control[field];
  return cell !== undefined && cell !== null && String(cell).trim() !== "" && String(cell) !== "N/A";
}

export function coverageByFramework(
  controls: ControlRow[],
  frameworks: readonly FrameworkColumn[]
): FrameworkCoverage[] {
  return frameworks.map((f) => {
    const mapped = controls.filter((c) => mapsToFramework(c, f.field));
    return {
      id: f.id,
      label: f.label,
      field: f.field,
      mappedCount: mapped.length,
      coveragePct:
        mapped.length > 0 ? mapped.reduce((sum, c) => sum + (c.coveragePct ?? 0), 0) / mapped.length : null,
    };
  });
}

// Headline number = mean of the per-framework percentages, so every framework
// carries equal weight regardless of how many controls happen to map to it.
// (Averaging raw controls instead would let whichever framework has the most
// mappings quietly dominate the figure.)
export function averageOfFrameworks(rows: FrameworkCoverage[]): number {
  const scored = rows.filter((r) => r.coveragePct !== null);
  if (scored.length === 0) return 0;
  return scored.reduce((sum, r) => sum + (r.coveragePct ?? 0), 0) / scored.length;
}
