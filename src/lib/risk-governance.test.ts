import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOverridden,
  bandDistance,
  suggestionIsStale,
  requiresJustification,
  overrideLabel,
  ownerDisplayName,
  ERASED_OWNER_LABEL,
  RETENTION_SCHEDULE,
} from "./risk-governance";
import { ALE_BANDS, PROBABILITY_BANDS, ratingFromAle, ratingFromProbability, aleBandLabel } from "./risk-rating";

const model = { likelihood: 3, impact: 4 };

test("G7 — accepting the model's suggestion is not an override", () => {
  assert.equal(isOverridden({ likelihood: 3, impact: 4 }, model), false);
});

test("G7 — changing either axis is an override", () => {
  assert.equal(isOverridden({ likelihood: 2, impact: 4 }, model), true);
  assert.equal(isOverridden({ likelihood: 3, impact: 5 }, model), true);
});

test("G7 — with no assessment there is no suggestion, so nothing is an override", () => {
  // A risk entered before any simulation has run is not diverging from
  // anything; flagging it would be noise.
  assert.equal(isOverridden({ likelihood: 1, impact: 1 }, null), false);
  assert.equal(overrideLabel(null), null);
});

test("G7 — an override needs a reason, and accepting the model does not", () => {
  const accepted = requiresJustification({ likelihood: 3, impact: 4 }, model, null);
  assert.equal(accepted.ok, true, "demanding a reason to agree trains people to type 'ok'");

  const bare = requiresJustification({ likelihood: 1, impact: 1 }, model, null);
  assert.equal(bare.ok, false);
  assert.match(bare.ok === false ? bare.reason : "", /3x4/, "the reason must name what was suggested");
});

test("G7 — a token justification is refused", () => {
  for (const text of ["", "   ", "ok", "n/a", "fine"]) {
    const check = requiresJustification({ likelihood: 1, impact: 1 }, model, text);
    assert.equal(check.ok, false, `"${text}" should not pass as a justification`);
  }
  const real = requiresJustification(
    { likelihood: 1, impact: 1 },
    model,
    "Compensating contractual indemnity with the vendor caps our exposure."
  );
  assert.equal(real.ok, true);
});

test("G7 — band distance is the largest movement on either axis", () => {
  assert.equal(bandDistance({ likelihood: 3, impact: 4 }, { likelihood: 3, impact: 4 }), 0);
  assert.equal(bandDistance({ likelihood: 3, impact: 4 }, { likelihood: 2, impact: 4 }), 1);
  assert.equal(bandDistance({ likelihood: 1, impact: 5 }, { likelihood: 4, impact: 4 }), 3);
});

test("G7 — a new assessment that moves the suggestion by a band re-flags the risk", () => {
  assert.equal(suggestionIsStale(model, { likelihood: 4, impact: 4 }), true);
  assert.equal(suggestionIsStale(model, { likelihood: 3, impact: 4 }), false);
});

test("G7 — sub-band movement does not re-flag, because it cannot change the score", () => {
  // The ordinal cannot express a fraction of a band, so re-flagging on one
  // would cry wolf on noise the score is incapable of reflecting.
  assert.equal(suggestionIsStale(model, model), false);
  assert.equal(suggestionIsStale(null, model), false);
  assert.equal(suggestionIsStale(model, null), false);
});

test("G7 — the published bands and the rating function cannot disagree", () => {
  // The bands are data and the function is derived from them. This asserts
  // that every band's interior maps back to its own rating — the same
  // single-source discipline M1 imposed on the estimator.
  for (const band of ALE_BANDS) {
    const inside = band.max === null ? band.min * 2 + 1 : (band.min + band.max) / 2;
    assert.equal(ratingFromAle(inside), band.rating, `ALE ${inside} should be rating ${band.rating}`);
    assert.equal(ratingFromAle(band.min), band.rating, `lower bound ${band.min} is inclusive`);
  }
  for (const band of PROBABILITY_BANDS) {
    const inside = band.max === null ? Math.min(band.min + 0.2, 0.99) : (band.min + band.max) / 2;
    assert.equal(ratingFromProbability(inside), band.rating);
  }
});

test("G7 — every rating can be decoded into a range a reader can check", () => {
  for (const band of ALE_BANDS) {
    const label = aleBandLabel(band.rating);
    assert.ok(label.length > 0 && label !== "—", `rating ${band.rating} has no published range`);
  }
});

test("G8 — an erased owner renders as erased wherever the name would appear", () => {
  assert.equal(ownerDisplayName({ displayName: "Priya Raman", erasedAt: null }), "Priya Raman");
  assert.equal(
    ownerDisplayName({ displayName: "erased-abc123", erasedAt: new Date() }),
    ERASED_OWNER_LABEL,
    "the stored placeholder must never surface"
  );
});

test("G8 — the retention schedule covers every store that holds data", () => {
  const covered = RETENTION_SCHEDULE.map((r) => r.data.toLowerCase()).join(" ");
  for (const store of ["assessment", "evidence", "audit", "owner", "what-if", "session"]) {
    assert.ok(covered.includes(store), `no retention rule mentions ${store}`);
  }
  // A schedule without a stated basis is a number someone made up.
  for (const rule of RETENTION_SCHEDULE) {
    assert.ok(rule.period.length > 0, `${rule.data} has no period`);
    assert.ok(rule.basis.length > 20, `${rule.data} has no real basis`);
  }
});
