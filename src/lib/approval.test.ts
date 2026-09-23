import { test } from "node:test";
import assert from "node:assert/strict";
import { canApprove, APPROVER_ROLE } from "./approval";
import type { ApprovalSubject, Approver } from "./approval";

const draft: ApprovalSubject = {
  status: "DRAFT",
  runById: "analyst-1",
  parameterSetHash: "abc123",
};
const admin: Approver = { id: "admin-1", role: "ADMIN" };

test("G4 — a clean draft, approved by someone else, is signed off", () => {
  const check = canApprove(draft, admin, true);
  assert.equal(check.ok, true);
});

test("G4 — anyone below the approver role is refused", () => {
  for (const role of ["VIEWER", "ANALYST", "CONTROL_OWNER"] as const) {
    const check = canApprove(draft, { id: "u", role }, true);
    assert.equal(check.ok, false);
    assert.equal(check.ok === false && check.code, "NOT_APPROVER");
  }
  // And the constant the route gates on is the same one tested here, so the
  // two cannot drift apart.
  assert.equal(APPROVER_ROLE, "ADMIN");
});

test("G4 — segregation of duties: you cannot approve a run you produced", () => {
  const check = canApprove({ ...draft, runById: admin.id }, admin, true);
  assert.equal(check.ok, false);
  assert.equal(check.ok === false && check.code, "SELF_APPROVAL");
});

test("G4 — being an admin does not waive segregation of duties", () => {
  // The seniority of the person who ran it is irrelevant: an assessment
  // produced and signed off by one pair of hands evidences nothing.
  const check = canApprove({ ...draft, runById: "admin-1" }, { id: "admin-1", role: "ADMIN" }, true);
  assert.equal(check.ok === false && check.code, "SELF_APPROVAL");
});

test("G4 — an approval is immutable: an approved assessment cannot be re-approved", () => {
  const check = canApprove({ ...draft, status: "APPROVED" }, admin, true);
  assert.equal(check.ok, false);
  assert.equal(check.ok === false && check.code, "ALREADY_APPROVED");
});

test("G4 — figures that can no longer be re-derived cannot be attested to", () => {
  const check = canApprove(draft, admin, false);
  assert.equal(check.ok, false);
  assert.equal(check.ok === false && check.code, "NOT_REPRODUCIBLE");
});

test("G4 — a legacy row with no recorded runner can never be approved", () => {
  // runById is null on rows written before the column existed. Segregation of
  // duties cannot be evidenced for them, so the reproducibility gate catches
  // them first — and if parameters somehow still matched, the absence of a
  // runner must not read as "someone else ran it".
  const legacy: ApprovalSubject = { status: "DRAFT", runById: null, parameterSetHash: "unknown" };
  const check = canApprove(legacy, admin, false);
  assert.equal(check.ok, false);
  assert.equal(check.ok === false && check.code, "NOT_REPRODUCIBLE");
});

test("G4 — every refusal carries a reason a human can act on", () => {
  const refusals = [
    canApprove(draft, { id: "u", role: "ANALYST" }, true),
    canApprove({ ...draft, status: "APPROVED" }, admin, true),
    canApprove({ ...draft, runById: admin.id }, admin, true),
    canApprove(draft, admin, false),
  ];
  for (const r of refusals) {
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.ok(r.reason.length > 20, `reason too thin: ${r.reason}`);
      assert.ok(/[.!]$/.test(r.reason), "reason should be a sentence");
    }
  }
});

test("G4 — refusal order is stable, so the message names the first real blocker", () => {
  // An analyst looking at their own already-approved, stale assessment should
  // be told they are not an approver — the permission problem outranks the
  // state problems, because fixing the state would not let them through.
  const worst: ApprovalSubject = { status: "APPROVED", runById: "u", parameterSetHash: "old" };
  const check = canApprove(worst, { id: "u", role: "ANALYST" }, false);
  assert.equal(check.ok === false && check.code, "NOT_APPROVER");
});
