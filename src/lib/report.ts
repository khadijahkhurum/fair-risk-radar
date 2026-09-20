// Audit-evidence export: current control posture + latest risk assessment,
// as CSV (for a spreadsheet-driven auditor) or PDF (for a signable artifact).
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export interface ExportRow {
  controlId: string;
  controlName: string;
  category: string;
  nistCsf: string;
  iso27001: string;
  soc2: string;
  pciDss: string;
  euAiAct: string;
  owaspLlm: string;
  coveragePct: number;
  coverageSource: string;
}

export interface AssessmentSummary {
  scenarioName: string;
  meanAle: number;
  p10Ale: number;
  p50Ale: number;
  p90Ale: number;
  riskTolerance: number | null;
  pExceedTolerance: number | null;
  generatedAt: Date;
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(",");
}

export function buildCsvExport(rows: ExportRow[], assessment: AssessmentSummary | null): string {
  const lines: string[] = [];
  if (assessment) {
    // Plain Label,Value rows (not "#"-prefixed comments) so every line goes
    // through the same CSV escaping as the data below — a raw comma inside
    // an unescaped comment line is exactly what broke this before, since
    // Excel splits on every comma regardless of "#".
    lines.push(csvRow(["Scenario", assessment.scenarioName]));
    lines.push(csvRow(["Generated", assessment.generatedAt.toISOString()]));
    lines.push(csvRow(["Mean ALE (USD)", Math.round(assessment.meanAle)]));
    lines.push(csvRow(["P10 ALE (USD)", Math.round(assessment.p10Ale)]));
    lines.push(csvRow(["P50 ALE (USD)", Math.round(assessment.p50Ale)]));
    lines.push(csvRow(["P90 ALE (USD)", Math.round(assessment.p90Ale)]));
    if (assessment.riskTolerance !== null) {
      lines.push(csvRow(["Risk Tolerance (USD)", Math.round(assessment.riskTolerance)]));
    }
    if (assessment.pExceedTolerance !== null) {
      lines.push(csvRow(["P(loss > tolerance)", `${(assessment.pExceedTolerance * 100).toFixed(1)}%`]));
    }
    lines.push("");
  }
  lines.push(
    csvRow([
      "Control ID",
      "Control Name",
      "Category",
      "NIST CSF 2.0",
      "ISO 27001:2022",
      "SOC 2",
      "PCI DSS v4.0",
      "EU AI Act",
      "OWASP LLM Top 10",
      "Coverage %",
      "Coverage Source",
    ])
  );
  for (const row of rows) {
    lines.push(
      csvRow([
        row.controlId,
        row.controlName,
        row.category,
        row.nistCsf,
        row.iso27001,
        row.soc2,
        row.pciDss,
        row.euAiAct,
        row.owaspLlm,
        row.coveragePct.toFixed(1),
        row.coverageSource,
      ])
    );
  }
  return lines.join("\n");
}

// --- PDF ---------------------------------------------------------------

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ACCENT = rgb(0.388, 0.4, 0.965); // matches the app's --accent
const INK = rgb(0.09, 0.09, 0.12);
const MUTED = rgb(0.42, 0.44, 0.5);
const BORDER = rgb(0.85, 0.86, 0.9);
const ROW_ALT = rgb(0.965, 0.966, 0.98);

// Greedy word-wrap — pdf-lib has no built-in text flow, and a board member
// reading a run-on sentence off the page edge is exactly the "not readable"
// complaint this fixes.
function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function coverageColor(pct: number) {
  if (pct >= 80) return rgb(0.02, 0.55, 0.36); // green
  if (pct >= 50) return rgb(0.7, 0.5, 0.02); // amber
  return rgb(0.75, 0.16, 0.24); // red
}

const COLUMNS = [
  { label: "Control", width: 118 },
  { label: "NIST CSF", width: 58 },
  { label: "ISO 27001", width: 58 },
  { label: "SOC 2", width: 50 },
  { label: "PCI DSS", width: 46 },
  { label: "Coverage", width: 58 },
  { label: "Source", width: 84 },
] as const;

export async function buildPdfExport(
  rows: ExportRow[],
  assessment: AssessmentSummary | null
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let pageNum = 0;
  let page!: PDFPage;
  let y = 0;

  const newPage = (withHeader: boolean) => {
    pageNum++;
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    if (withHeader) drawBrandHeader();
  };

  const drawBrandHeader = () => {
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 64, width: PAGE_WIDTH, height: 64, color: ACCENT });
    page.drawText("FAIR Risk Radar", { x: MARGIN, y: PAGE_HEIGHT - 32, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Audit Evidence Export", {
      x: MARGIN,
      y: PAGE_HEIGHT - 50,
      size: 10,
      font,
      color: rgb(0.9, 0.9, 1),
    });
    const generated = `Generated ${new Date().toISOString()}`;
    page.drawText(generated, {
      x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(generated, 8),
      y: PAGE_HEIGHT - 28,
      size: 8,
      font,
      color: rgb(0.9, 0.9, 1),
    });
    y = PAGE_HEIGHT - 64 - 28;
  };

  const ensureSpace = (needed: number, onNewPage?: () => void) => {
    if (y - needed < MARGIN + 24) {
      drawFooter();
      newPage(false);
      onNewPage?.();
    }
  };

  const drawFooter = () => {
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 14 },
      end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 14 },
      thickness: 0.5,
      color: BORDER,
    });
    page.drawText("FAIR Risk Radar — confidential, for internal audit use", {
      x: MARGIN,
      y: MARGIN,
      size: 7,
      font,
      color: MUTED,
    });
    const label = `Page ${pageNum}`;
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(label, 7),
      y: MARGIN,
      size: 7,
      font,
      color: MUTED,
    });
  };

  newPage(true);

  if (assessment) {
    page!.drawText(`Scenario: ${assessment.scenarioName}`, { x: MARGIN, y, size: 13, font: bold, color: INK });
    y -= 24;

    // Plain-language verdict banner — the thing a board member actually
    // reads. Everything below it (percentile tiles, the control table) is
    // supporting detail for whoever wants to dig in, not the headline.
    if (assessment.riskTolerance !== null && assessment.pExceedTolerance !== null) {
      const breaches = assessment.pExceedTolerance > 0.1;
      const bannerColor = breaches ? rgb(0.75, 0.16, 0.24) : rgb(0.02, 0.55, 0.36);
      const bannerBg = breaches ? rgb(0.99, 0.94, 0.94) : rgb(0.93, 0.98, 0.96);
      const verdict = breaches ? "Exceeds risk tolerance" : "Within risk tolerance";
      const sentence = `Based on thousands of simulated years, this scenario costs about $${Math.round(
        assessment.meanAle
      ).toLocaleString()} a year on average, and has a ${(assessment.pExceedTolerance * 100).toFixed(
        0
      )}% chance in any given year of exceeding the board's $${Math.round(
        assessment.riskTolerance
      ).toLocaleString()} risk tolerance.`;
      const sentenceLines = wrapText(sentence, CONTENT_WIDTH - 24, font, 11);
      const bannerHeight = 34 + sentenceLines.length * 15;

      page!.drawRectangle({ x: MARGIN, y: y - bannerHeight, width: CONTENT_WIDTH, height: bannerHeight, color: bannerBg, borderColor: bannerColor, borderWidth: 1 });
      page!.drawText(verdict, { x: MARGIN + 12, y: y - 22, size: 15, font: bold, color: bannerColor });
      sentenceLines.forEach((l, i) => {
        page!.drawText(l, { x: MARGIN + 12, y: y - 40 - i * 15, size: 11, font, color: INK });
      });
      y -= bannerHeight + 20;
    }

    page!.drawText("Supporting figures", { x: MARGIN, y, size: 10, font: bold, color: MUTED });
    y -= 16;

    const tiles: { label: string; value: string; color?: ReturnType<typeof rgb> }[] = [
      { label: "Mean ALE", value: `$${Math.round(assessment.meanAle).toLocaleString()}` },
      { label: "P10 ALE", value: `$${Math.round(assessment.p10Ale).toLocaleString()}` },
      { label: "P50 ALE", value: `$${Math.round(assessment.p50Ale).toLocaleString()}` },
      { label: "P90 ALE", value: `$${Math.round(assessment.p90Ale).toLocaleString()}` },
    ];
    if (assessment.riskTolerance !== null && assessment.pExceedTolerance !== null) {
      tiles.push({
        label: "P(loss > tolerance)",
        value: `${(assessment.pExceedTolerance * 100).toFixed(1)}%`,
        color: assessment.pExceedTolerance > 0.1 ? rgb(0.75, 0.16, 0.24) : rgb(0.02, 0.55, 0.36),
      });
    }

    const tileWidth = CONTENT_WIDTH / tiles.length;
    const tileTop = y;
    for (let i = 0; i < tiles.length; i++) {
      const x = MARGIN + i * tileWidth;
      page!.drawRectangle({
        x,
        y: tileTop - 40,
        width: tileWidth - 6,
        height: 40,
        borderColor: BORDER,
        borderWidth: 1,
      });
      page!.drawText(tiles[i].label, { x: x + 6, y: tileTop - 14, size: 7, font, color: MUTED });
      page!.drawText(tiles[i].value, { x: x + 6, y: tileTop - 30, size: 11, font: bold, color: tiles[i].color ?? INK });
    }
    y = tileTop - 40 - 24;
  }

  page!.drawText("Appendix: Control Posture (audit detail)", { x: MARGIN, y, size: 13, font: bold, color: INK });
  y -= 10;
  page!.drawText(`${rows.length} controls, cross-mapped to NIST CSF 2.0, ISO 27001:2022, SOC 2, and PCI DSS v4.0.`, {
    x: MARGIN,
    y: y - 8,
    size: 8,
    font,
    color: MUTED,
  });
  y -= 26;

  const drawTableHeader = () => {
    page!.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_WIDTH, height: 18, color: rgb(0.94, 0.94, 0.97) });
    let x = MARGIN + 4;
    for (const col of COLUMNS) {
      page!.drawText(col.label, { x, y: y - 11, size: 8, font: bold, color: INK });
      x += col.width;
    }
    y -= 20;
  };

  ensureSpace(30);
  drawTableHeader();

  rows.forEach((row, i) => {
    ensureSpace(18, drawTableHeader);
    if (i % 2 === 1) {
      page!.drawRectangle({ x: MARGIN, y: y - 13, width: CONTENT_WIDTH, height: 16, color: ROW_ALT });
    }
    let x = MARGIN + 4;
    const cells = [row.controlName, row.nistCsf, row.iso27001, row.soc2, row.pciDss];
    cells.forEach((text, colIdx) => {
      const col = COLUMNS[colIdx];
      const truncated = font.widthOfTextAtSize(text, 8) > col.width - 8 ? text.slice(0, 18) + "…" : text;
      page!.drawText(truncated, { x, y: y - 9, size: 8, font, color: INK });
      x += col.width;
    });
    // Coverage %, color-coded
    page!.drawText(`${row.coveragePct.toFixed(0)}%`, {
      x,
      y: y - 9,
      size: 8,
      font: bold,
      color: coverageColor(row.coveragePct),
    });
    x += COLUMNS[5].width;
    // Source, as a small bracketed tag rather than glued to the number
    page!.drawText(`(${row.coverageSource})`, { x, y: y - 9, size: 7, font, color: MUTED });

    y -= 16;
  });

  drawFooter();

  return doc.save();
}
