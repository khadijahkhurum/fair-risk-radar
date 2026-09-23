import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUDIT_KINDS } from "./audit-kinds";

// The audit taxonomy exists in exactly two places now: this module, and the
// Prisma enum — because the schema is its own language and cannot import TS.
//
// That remaining duplication is what let ERASURE be added to the schema while
// the TypeScript union stayed behind, which would have been an undefined
// KIND_STYLE lookup and a runtime crash on the audit page. So the duplication
// is now checked rather than merely noted.
function auditKindsFromSchema(): string[] {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const match = /enum AuditKind \{([^}]*)\}/.exec(schema);
  assert.ok(match, "AuditKind enum not found in prisma/schema.prisma");
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("///"));
}

test("the TypeScript audit taxonomy matches the Prisma enum exactly", () => {
  // Same members AND same order: the order is what the audit page's filter
  // chips render in, so a silent reorder is a visible UI change.
  assert.deepEqual([...AUDIT_KINDS], auditKindsFromSchema());
});

test("no audit kind is listed twice", () => {
  assert.equal(new Set(AUDIT_KINDS).size, AUDIT_KINDS.length);
});

test("every audit kind is a plain uppercase identifier", () => {
  // Prisma enum members and the JSON that carries them across the wire both
  // assume this; a stray character would fail at the database boundary.
  for (const kind of AUDIT_KINDS) {
    assert.match(kind, /^[A-Z_]+$/, `${kind} is not a valid enum member`);
  }
});
