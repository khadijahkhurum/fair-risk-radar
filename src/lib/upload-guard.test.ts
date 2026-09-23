import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectTextUpload, EVIDENCE_MAX_BYTES } from "./upload-guard";

const bytes = (s: string) => new TextEncoder().encode(s);

test("S9 — a real CSV is accepted", () => {
  const v = inspectTextUpload(bytes("user,role\nalice,admin\nbob,viewer\n"), "access-review.csv");
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.text.startsWith("user,role"), true);
});

test("S9 — the extension allowlist still applies", () => {
  for (const name of ["payload.exe", "report.pdf", "notes.md", "archive.zip", "noextension"]) {
    const v = inspectTextUpload(bytes("hello"), name);
    assert.equal(v.ok, false, name);
    assert.equal(v.ok === false && v.status, 415);
  }
});

test("S9 — a renamed binary is refused, and the error names what it really is", () => {
  const cases: [string, number[]][] = [
    ["a PDF", [0x25, 0x50, 0x44, 0x46, 0x2d]],
    ["a ZIP or Office file", [0x50, 0x4b, 0x03, 0x04, 0x14]],
    ["a PNG image", [0x89, 0x50, 0x4e, 0x47, 0x0d]],
    ["a Windows executable", [0x4d, 0x5a, 0x90, 0x00]],
    ["a Linux executable", [0x7f, 0x45, 0x4c, 0x46, 0x02]],
    ["a gzip archive", [0x1f, 0x8b, 0x08, 0x00]],
  ];
  for (const [label, sig] of cases) {
    // .csv extension, because that is exactly the smuggling case: the client
    // hint says text, the bytes say otherwise.
    const v = inspectTextUpload(new Uint8Array(sig), "evidence.csv");
    assert.equal(v.ok, false, label);
    assert.equal(v.ok === false && v.status, 415);
    assert.ok(v.ok === false && v.reason.includes(label), `expected "${label}" in: ${v.ok === false && v.reason}`);
  }
});

test("S9 — invalid UTF-8 is refused even with no known signature", () => {
  // The signature list is for error messages; the decode is the boundary.
  const v = inspectTextUpload(new Uint8Array([0xc3, 0x28, 0xa0, 0xa1]), "evidence.csv");
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.status, 415);
  assert.match(v.ok === false ? v.reason : "", /UTF-8/);
});

test("S9 — a NUL byte is refused: valid UTF-8 is not the same as text", () => {
  const v = inspectTextUpload(bytes("user,role\nalice\u0000,admin\n"), "evidence.csv");
  assert.equal(v.ok, false);
  assert.match(v.ok === false ? v.reason : "", /NUL/);
});

test("S9 — stray control characters are refused, but tab, CR and LF are not", () => {
  const good = inspectTextUpload(bytes("a\tb\r\nc\td\r\n"), "evidence.csv");
  assert.equal(good.ok, true, "tab/CR/LF are legitimate in a CSV");

  for (const code of [0x01, 0x07, 0x0b, 0x0c, 0x1b]) {
    const v = inspectTextUpload(bytes(`ok${String.fromCharCode(code)}bad`), "evidence.csv");
    assert.equal(v.ok, false, `0x${code.toString(16)} should be refused`);
  }
});

test("S9 — an Excel BOM is stripped rather than becoming part of the first header", () => {
  const v = inspectTextUpload(bytes("﻿user,role\nalice,admin\n"), "evidence.csv");
  assert.equal(v.ok, true);
  assert.equal(v.ok && v.text.startsWith("user,role"), true, "BOM must not survive into the parsed header");
});

test("S9 — empty and oversized uploads are refused with the right status", () => {
  const empty = inspectTextUpload(new Uint8Array(0), "evidence.csv");
  assert.equal(empty.ok === false && empty.status, 422);

  const huge = new Uint8Array(EVIDENCE_MAX_BYTES + 1).fill(0x61);
  const over = inspectTextUpload(huge, "evidence.csv");
  assert.equal(over.ok === false && over.status, 413);
});

test("S9 — a file exactly at the limit is accepted", () => {
  const exact = new Uint8Array(EVIDENCE_MAX_BYTES).fill(0x61);
  assert.equal(inspectTextUpload(exact, "evidence.csv").ok, true);
});

test("S9 — non-ASCII text is accepted: this is a UTF-8 check, not an ASCII one", () => {
  const v = inspectTextUpload(bytes("name,rôle\nJosé,administrateur\n日本,管理者\n"), "evidence.csv");
  assert.equal(v.ok, true);
});

test("S9 — every refusal carries a status the route can return directly", () => {
  const refusals = [
    inspectTextUpload(new Uint8Array(0), "e.csv"),
    inspectTextUpload(bytes("x"), "e.exe"),
    inspectTextUpload(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "e.csv"),
  ];
  for (const r of refusals) {
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.ok([413, 415, 422].includes(r.status));
      assert.ok(r.reason.length > 10 && /[.!]$/.test(r.reason), `weak reason: ${r.reason}`);
    }
  }
});
