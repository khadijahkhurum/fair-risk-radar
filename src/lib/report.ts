// Audit-evidence export: current control posture + latest risk assessment,
// as CSV (for a spreadsheet-driven auditor) or PDF (for a signable artifact).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface ExportRow {
  controlId: string;
  controlName: string;
  category: string;
  nistCsf: string;
  iso27001: string;
  soc2: string;
  pciDss: string;
  coveragePct: number;
  coverageSource: string;
}

export interface AssessmentSummary {
  scenarioName: string;
  meanAle: number;
  p10Ale: number;
  p50Ale: number;
  p90Ale: number;
  generatedAt: Date;
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvExport(rows: ExportRow[], assessment: AssessmentSummary | null): string {
  const lines: string[] = [];
  if (assessment) {
    lines.push(`# Scenario: ${assessment.scenarioName}`);
    lines.push(`# Generated: ${assessment.generatedAt.toISOString()}`);
    lines.push(
      `# Mean ALE: $${Math.round(assessment.meanAle).toLocaleString()} | P10: $${Math.round(
        assessment.p10Ale
      ).toLocaleString()} | P50: $${Math.round(assessment.p50Ale).toLocaleString()} | P90: $${Math.round(
        assessment.p90Ale
      ).toLocaleString()}`
    );
    lines.push("");
  }
  const header = [
    "Control ID",
    "Control Name",
    "Category",
    "NIST CSF 2.0",
    "ISO 27001:2022",
    "SOC 2",
    "PCI DSS v4.0",
    "Coverage %",
    "Coverage Source",
  ];
  lines.push(header.map(escapeCsvField).join(","));
  for (const row of rows) {
    lines.push(
      [
        row.controlId,
        row.controlName,
        row.category,
        row.nistCsf,
        row.iso27001,
        row.soc2,
        row.pciDss,
        row.coveragePct.toFixed(1),
        row.coverageSource,
      ]
        .map(escapeCsvField)
        .join(",")
    );
  }
  return lines.join("\n");
}

export async function buildPdfExport(
  rows: ExportRow[],
  assessment: AssessmentSummary | null
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]); // US Letter
  const margin = 48;
  let y = 792 - margin;

  const drawText = (text: string, size: number, useBold = false, color = rgb(0, 0, 0)) => {
    if (y < margin + 20) {
      page = doc.addPage([612, 792]);
      y = 792 - margin;
    }
    page.drawText(text, { x: margin, y, size, font: useBold ? bold : font, color });
    y -= size + 6;
  };

  drawText("FAIR Risk Radar — Audit Evidence Export", 16, true);
  drawText(`Generated: ${new Date().toISOString()}`, 9, false, rgb(0.4, 0.4, 0.4));
  y -= 8;

  if (assessment) {
    drawText(`Scenario: ${assessment.scenarioName}`, 12, true);
    drawText(
      `Mean ALE: $${Math.round(assessment.meanAle).toLocaleString()}  |  P10: $${Math.round(
        assessment.p10Ale
      ).toLocaleString()}  |  P50: $${Math.round(assessment.p50Ale).toLocaleString()}  |  P90: $${Math.round(
        assessment.p90Ale
      ).toLocaleString()}`,
      10
    );
    y -= 10;
  }

  drawText("Control Posture", 12, true);
  for (const row of rows) {
    drawText(
      `${row.controlName}  —  ${row.coveragePct.toFixed(1)}% (${row.coverageSource})`,
      10,
      true
    );
    drawText(
      `  NIST CSF ${row.nistCsf} · ISO 27001 ${row.iso27001} · SOC 2 ${row.soc2} · PCI DSS ${row.pciDss}`,
      9,
      false,
      rgb(0.35, 0.35, 0.35)
    );
  }

  return doc.save();
}
