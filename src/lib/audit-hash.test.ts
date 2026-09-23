import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, computeEventHash, findChainBreak } from "./audit-hash";

test("canonicalJson is key-order independent", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  assert.equal(canonicalJson({ x: { q: 1, p: 2 } }), canonicalJson({ x: { p: 2, q: 1 } }));
});

test("canonicalJson preserves array order, which is data", () => {
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
});

const base = {
  prevHash: null,
  orgId: "org_1",
  actorId: "user_1",
  kind: "COVERAGE",
  at: "2026-09-21T22:06:21.074Z",
  detail: { controlId: "mfa-enforcement", from: 40, to: 90 },
};

test("hashing is deterministic and independent of detail key order", () => {
  const a = computeEventHash(base);
  const b = computeEventHash({ ...base, detail: { to: 90, from: 40, controlId: "mfa-enforcement" } });
  assert.equal(a, b);
});

test("any changed field changes the hash", () => {
  const original = computeEventHash(base);
  assert.notEqual(computeEventHash({ ...base, actorId: "user_2" }), original);
  assert.notEqual(computeEventHash({ ...base, orgId: "org_2" }), original);
  assert.notEqual(computeEventHash({ ...base, kind: "RISK" }), original);
  assert.notEqual(computeEventHash({ ...base, at: "2026-09-21T22:06:22.000Z" }), original);
  assert.notEqual(computeEventHash({ ...base, detail: { ...base.detail, to: 91 } }), original);
});

function chain(details: unknown[]) {
  let prev: string | null = null;
  return details.map((detail, i) => {
    const e = { ...base, detail, at: `2026-09-21T22:0${i}:00.000Z`, prevHash: prev };
    const hash = computeEventHash(e);
    prev = hash;
    return { ...e, hash };
  });
}

test("an untouched chain verifies", () => {
  assert.equal(findChainBreak(chain([{ a: 1 }, { b: 2 }, { c: 3 }])), null);
});

test("S6 — altering a historical event is detected at that event", () => {
  const events = chain([{ a: 1 }, { b: 2 }, { c: 3 }]);
  events[1].detail = { b: 999 };
  assert.equal(findChainBreak(events), 1);
});

test("S6 — deleting an event from the middle is detected", () => {
  const events = chain([{ a: 1 }, { b: 2 }, { c: 3 }]);
  events.splice(1, 1);
  assert.equal(findChainBreak(events), 1);
});

test("S6 — re-hashing a tampered row still breaks, because the chain binds forward", () => {
  const events = chain([{ a: 1 }, { b: 2 }, { c: 3 }]);
  events[0].detail = { a: 999 };
  events[0].hash = computeEventHash(events[0]); // attacker recomputes this row
  assert.equal(findChainBreak(events), 1); // the NEXT row no longer matches
});
