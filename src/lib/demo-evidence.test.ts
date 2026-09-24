import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoEvidence, daysAgo } from "./demo-evidence";

// The demo evidence exists to make the AI reconciliation checkable by hand, so
// the ratios its comments claim are documentation that can rot. These assert
// them. If you edit a row and a test here fails, fix the comment too — the
// point of the file is that a reviewer can verify the model's arithmetic
// against what is on screen.

const files = buildDemoEvidence();

function rows(key: string) {
  const csv = files[key]?.csv;
  assert.ok(csv, `no demo evidence for ${key}`);
  const [header, ...lines] = csv.trim().split("\n");
  const cols = header.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}

/**
 * Whole days between an ISO date and today, as an auditor would count them.
 *
 * Both sides are taken at UTC midnight. Comparing against Date.now() instead
 * folds the current time of day into the difference, so a date generated
 * moments ago reads as one day old by the afternoon — which is how the first
 * version of this helper got it wrong.
 */
function ageDays(iso: string): number {
  const midnightToday = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((midnightToday - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
}

test("daysAgo returns an ISO date the stated number of days back", () => {
  assert.match(daysAgo(30), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(ageDays(daysAgo(30)), 30);
  assert.equal(ageDays(daysAgo(0)), 0);
});

test("MFA evidence contradicts its 87% claim: 11 of 15 enrolled", () => {
  const r = rows("mfa-enforcement");
  assert.equal(r.length, 15);
  const without = r.filter((x) => x.mfa_method === "none");
  assert.equal(without.length, 4);
  assert.equal(r.length - without.length, 11);
  // 73.3%, against 87% claimed — a contradiction a reader can count.
  assert.ok(Math.abs(((r.length - without.length) / r.length) * 100 - 73.3) < 0.1);
  // The sharper point: the control names privileged accounts specifically.
  assert.equal(without.filter((x) => x.account_type === "privileged").length, 2);
});

test("patch evidence AGREES with its 74% claim: 11 of 15 compliant", () => {
  const r = rows("patch-management");
  assert.equal(r.length, 15);
  assert.equal(r.filter((x) => x.status === "compliant").length, 11);
});

test("the two files share a ratio and must not share a verdict", () => {
  // 11/15 in both. MFA claims 87% and is contradicted; patching claims 74% and
  // is not. Whatever the model says, it is reporting on the COMPARISON rather
  // than on the document — which is the whole idea.
  const mfa = rows("mfa-enforcement");
  const patch = rows("patch-management");
  const mfaOk = mfa.filter((x) => x.mfa_method !== "none").length;
  const patchOk = patch.filter((x) => x.status === "compliant").length;
  assert.equal(mfaOk / mfa.length, patchOk / patch.length);
});

test("key rotation: two of four are past their interval, and nothing says so", () => {
  const r = rows("key-rotation");
  assert.equal(r.length, 4);
  const overdue = r.filter((x) => ageDays(x.last_rotated) > Number(x.rotation_interval_days));
  assert.equal(overdue.length, 2, "50% against 95% claimed");
  // One obvious, one marginal — the marginal one is what distinguishes doing
  // the arithmetic from eyeballing the dates.
  const margins = overdue
    .map((x) => ageDays(x.last_rotated) - Number(x.rotation_interval_days))
    .sort((a, b) => a - b);
  assert.ok(margins[0] <= 10, `tightest margin should be small, got ${margins[0]}`);
  assert.ok(margins[1] > 100, `widest margin should be obvious, got ${margins[1]}`);
  // Every row claims to be fine. The file never gives the answer away.
  assert.ok(r.every((x) => x.status === "ok"));
});

test("access review is sound but stale — a gap, not a contradiction", () => {
  const r = rows("access-review");
  assert.ok(r.length >= 6);
  assert.ok(r.every((x) => x.reviewed_by.length > 0 && x.decision.length > 0), "reviews are complete");
  assert.ok(
    r.every((x) => ageDays(x.review_date) > 150),
    "every row is at least two quarters old"
  );
});

test("no demo file carries a date that will drift into a different meaning", () => {
  // Any file whose verdict depends on a date must build it from daysAgo(), or
  // the demo says something different next month. Files without date-driven
  // verdicts are exempt, and are listed so the exemption is deliberate.
  const exempt = new Set(["vendor-risk-assessment", "incident-response-plan"]);
  for (const [key, file] of Object.entries(files)) {
    if (exempt.has(key)) continue;
    const hardcoded = file.csv.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    for (const d of hardcoded) {
      assert.ok(
        ageDays(d) < 400,
        `${key} carries ${d}, which is not a seed-relative date and has gone stale`
      );
    }
  }
});
