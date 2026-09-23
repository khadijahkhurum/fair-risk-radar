import { test } from "node:test";
import assert from "node:assert/strict";
import { object, str, num, arrayOf, idIn, nullable, optional, oneOf } from "./validate";

const THREATS = new Set(["ransomware", "phishing-bec", "insider"]);
const schema = object({
  scenarioId: str({ min: 1, max: 64 }),
  threatIds: optional(arrayOf(idIn(THREATS, "threatId"), { max: 16, unique: true })),
  riskTolerance: optional(nullable(num({ min: 0, max: 1e12 }))),
  coveragePct: optional(num({ min: 0, max: 100 })),
});

test("accepts a well-formed body", () => {
  const r = schema.parse({ scenarioId: "financial-services", threatIds: ["ransomware"], coveragePct: 50 }, "");
  assert.equal(r.ok, true);
});

test("S11 — unknown keys are rejected, not ignored", () => {
  const r = schema.parse({ scenarioId: "x", __proto__: { polluted: true }, nope: 1 }, "");
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.includes("nope: unexpected field")));
});

test("M5 — duplicate threat IDs are collapsed", () => {
  const r = schema.parse({ scenarioId: "x", threatIds: Array(12).fill("ransomware") }, "");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value.threatIds, ["ransomware"]);
});

test("M5 — cardinality is capped", () => {
  const r = schema.parse({ scenarioId: "x", threatIds: Array(200).fill("ransomware") }, "");
  assert.equal(r.ok, false);
});

test("M5 — unknown threat IDs are named in the error", () => {
  const r = schema.parse({ scenarioId: "x", threatIds: ["nope"] }, "");
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.includes('unknown threatId "nope"')));
});

test("M6 — out-of-range numbers are REJECTED, not clamped", () => {
  for (const bad of [-500, 100000, 1e308]) {
    const r = schema.parse({ scenarioId: "x", coveragePct: bad }, "");
    assert.equal(r.ok, false, `coveragePct ${bad} should be rejected`);
  }
});

test("M6 — a string where a number belongs is rejected, not coerced to 0", () => {
  const r = schema.parse({ scenarioId: "x", coveragePct: "abc" }, "");
  assert.equal(r.ok, false);
});

test("M6 — non-finite numbers are rejected", () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(schema.parse({ scenarioId: "x", riskTolerance: bad }, "").ok, false);
  }
});

test("null is distinct from absent for nullable fields", () => {
  const withNull = schema.parse({ scenarioId: "x", riskTolerance: null }, "");
  assert.equal(withNull.ok, true);
  if (withNull.ok) assert.equal(withNull.value.riskTolerance, null);
});

test("required fields are reported by path", () => {
  const r = schema.parse({}, "");
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i === "scenarioId: required"));
});

test("oneOf rejects values outside the set", () => {
  const s = oneOf(["OPEN", "CLOSED"] as const);
  assert.equal(s.parse("OPEN", "status").ok, true);
  assert.equal(s.parse("BOGUS", "status").ok, false);
});

test("a non-object body is rejected", () => {
  for (const bad of [null, [], "string", 42]) {
    assert.equal(schema.parse(bad, "").ok, false);
  }
});
