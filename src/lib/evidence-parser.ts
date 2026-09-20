// Parses uploaded evidence (a CSV export like an access review or patch
// report, or a plain text note) into what gets stored on the Evidence row:
// a one-line summary, parsed rows for a CSV, and the raw text either way.
//
// ponytail: no PDF/DOCX parsing here — that needs a real parsing library
// (pdf-parse, mammoth), and a portfolio demo's evidence is realistically a
// CSV export or a pasted note, not a scanned document. Add a doc-parsing
// dependency if real document evidence becomes a real requirement.
const MAX_ROWS_STORED = 200;

export class EvidenceParseError extends Error {}

export interface ParsedEvidence {
  contentType: "csv" | "text";
  summary: string;
  parsedRows: Record<string, string>[] | null;
  rawText: string;
}

function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new EvidenceParseError("CSV must have a header row and at least one data row");
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1, 1 + MAX_ROWS_STORED).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((col, i) => {
      row[col] = cells[i] ?? "";
    });
    return row;
  });
}

export function parseEvidence(text: string, filename: string): ParsedEvidence {
  const isCsv = /\.csv$/i.test(filename);

  if (isCsv) {
    const rows = parseCsvRows(text);
    const totalLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length - 1;
    const truncated = totalLines > MAX_ROWS_STORED;
    return {
      contentType: "csv",
      summary: `CSV, ${totalLines} row${totalLines === 1 ? "" : "s"}${truncated ? ` (first ${MAX_ROWS_STORED} stored)` : ""}, columns: ${Object.keys(rows[0] ?? {}).join(", ")}`,
      parsedRows: rows,
      rawText: text.slice(0, 200_000),
    };
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return {
    contentType: "text",
    summary: `Text note, ${wordCount} word${wordCount === 1 ? "" : "s"}`,
    parsedRows: null,
    rawText: text.slice(0, 200_000),
  };
}
