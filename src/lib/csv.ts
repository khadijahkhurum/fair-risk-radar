// CSV writing primitives (audit S10).
//
// Split out of report.ts purely so this is testable: report.ts imports pdf-lib
// at module scope, which drags a PDF engine into any test that wants to check
// string escaping.

/**
 * Escape a CSV field AND neutralise spreadsheet formula injection.
 *
 * Excel, LibreOffice and Sheets evaluate any cell whose first character is
 * `=`, `+`, `-`, `@`, tab or CR as a formula — including `=HYPERLINK(...)`
 * for exfiltration and, in older Excel, `=cmd|...` DDE payloads. Quoting
 * alone does not stop this: the CSV parser strips the quotes before the
 * formula is read.
 *
 * Neutralised on WRITE, not on read, because by read time the file has left
 * this application and nothing here can protect it.
 *
 * The leading apostrophe is the standard neutraliser: every major spreadsheet
 * reads it as "the rest of this cell is literal text" and hides it in the cell
 * display, so a human still sees the intended value.
 *
 * Numbers are formatted by the caller and never user-supplied, so they pass
 * through untouched — otherwise a negative value would be quoted as text and
 * stop summing in the spreadsheet, which is a real cost for no security gain.
 */
export function escapeCsvField(value: string | number): string {
  if (typeof value === "number") return String(value);
  const str = String(value ?? "");
  const startsFormula = /^[=+\-@\t\r]/.test(str);
  const body = startsFormula ? `'${str}` : str;
  const needsQuotes =
    startsFormula ||
    body.includes(",") ||
    body.includes('"') ||
    body.includes("\n") ||
    body.includes("\r");
  return needsQuotes ? `"${body.replace(/"/g, '""')}"` : body;
}

export function csvRow(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(",");
}
