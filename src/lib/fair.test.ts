// Unit tests for the FAIR Monte Carlo engine. Uses node's built-in test
// runner (via the tsx loader already in devDependencies) — no new test
// framework dependency for a handful of pure-function checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { threats } from "./threats";
import { runFairSimulation, PARTITION_BASIS } from "./fair";

const scenario = {
  tefLambda: 10,
  vulnerability: 0.3,
  primaryLossMin: 700_000,
  primaryLossMode: 1_400_000,
  primaryLossMax: 3_500_000,
  secondaryLossProbability: 0.7,
  secondaryLossMin: 300_000,
  secondaryLossMode: 600_000,
  secondaryLossMax: 1_500_000,
};

test("runFairSimulation returns internally consistent percentiles", () => {
  const result = runFairSimulation(scenario, [], 0, null, 2000);
  assert.equal(result.trials, 2000);
  assert.ok(result.p10Ale <= result.p50Ale, "p10 should not exceed p50");
  assert.ok(result.p50Ale <= result.p90Ale, "p50 should not exceed p90");
  assert.ok(result.meanAle >= 0);
});

test("higher control coverage never increases mean ALE", () => {
  const noCoverage = runFairSimulation(scenario, [], 0, null, 4000);
  const fullCoverage = runFairSimulation(scenario, [], 100, null, 4000);
  // Monte Carlo noise means this isn't exact — full coverage should be
  // substantially lower, not just "different."
  assert.ok(
    fullCoverage.meanAle < noCoverage.meanAle * 0.85,
    `expected full coverage (${fullCoverage.meanAle}) to be well below no coverage (${noCoverage.meanAle})`
  );
});

test("M10 — adding a community to a selection never decreases adjustedTefLambda", () => {
  // Monotone WITHIN the selection: bringing another community into scope adds
  // its share. Note this is no longer monotone against the empty selection —
  // see the partition tests below, where that is the point rather than a bug.
  const one = runFairSimulation(scenario, [threats[0]], 0, null, 500);
  const two = runFairSimulation(scenario, [threats[0], threats[1]], 0, null, 500);
  const three = runFairSimulation(scenario, [threats[0], threats[1], threats[2]], 0, null, 500);
  assert.ok(two.adjustedTefLambda > one.adjustedTefLambda);
  assert.ok(three.adjustedTefLambda > two.adjustedTefLambda);
});

test("M10 — the FULL catalogue reproduces the sector baseline, it does not multiply it", () => {
  // The finding: selecting all five communities gave 5x the sector's
  // all-cause frequency, because each inherited a scaled copy of the whole
  // baseline rather than a share of it. A CISO ticking every box because
  // every threat is real got six times the baseline for doing the obvious
  // thing.
  const baseline = runFairSimulation(scenario, [], 0, null, 500);
  const everything = runFairSimulation(scenario, threats, 0, null, 500);
  assert.ok(
    Math.abs(everything.adjustedTefLambda - baseline.adjustedTefLambda) < 1e-9,
    `full catalogue ${everything.adjustedTefLambda} should equal baseline ${baseline.adjustedTefLambda}`
  );
});

test("M10 — a subset is a SHARE of the baseline, so it is strictly less than all-cause", () => {
  const baseline = runFairSimulation(scenario, [], 0, null, 500);
  for (const t of threats) {
    const single = runFairSimulation(scenario, [t], 0, null, 500);
    assert.ok(
      single.adjustedTefLambda < baseline.adjustedTefLambda,
      `${t.id} alone (${single.adjustedTefLambda}) must be less than all-cause (${baseline.adjustedTefLambda})`
    );
  }
});

test("M10 — shares are proportional to the multipliers and sum to one", () => {
  const baseline = runFairSimulation(scenario, [], 0, null, 500).adjustedTefLambda;
  const shares = threats.map((t) => runFairSimulation(scenario, [t], 0, null, 500).adjustedTefLambda / baseline);
  const total = shares.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares should partition the baseline, summed to ${total}`);

  // The largest multiplier gets the largest share, and the ordering is
  // preserved — partitioning must not scramble the relative weights.
  const byMultiplier = [...threats].sort((a, b) => b.tefMultiplier - a.tefMultiplier).map((t) => t.id);
  const byShare = threats
    .map((t, i) => ({ id: t.id, share: shares[i] }))
    .sort((a, b) => b.share - a.share)
    .map((x) => x.id);
  assert.deepEqual(byShare, byMultiplier);
});

test("M10 — PARTITION_BASIS is the catalogue's own total, not a hardcoded constant", () => {
  assert.equal(
    PARTITION_BASIS,
    threats.reduce((sum, t) => sum + t.tefMultiplier, 0)
  );
});

test("the Loss Exceedance Curve is monotonically non-increasing", () => {
  const result = runFairSimulation(scenario, [], 0, null, 3000);
  for (let i = 1; i < result.lec.length; i++) {
    assert.ok(
      result.lec[i].probability <= result.lec[i - 1].probability,
      `LEC probability increased at index ${i}`
    );
  }
});

test("pExceedTolerance is null without a tolerance, and bounded with one", () => {
  const noTolerance = runFairSimulation(scenario, [], 50, null, 500);
  assert.equal(noTolerance.pExceedTolerance, null);

  const withTolerance = runFairSimulation(scenario, [], 50, 1_500_000, 500);
  assert.ok(withTolerance.pExceedTolerance !== null);
  assert.ok(withTolerance.pExceedTolerance! >= 0 && withTolerance.pExceedTolerance! <= 1);
});

test("a tolerance of 0 is exceeded by essentially every simulated year with a nonzero loss", () => {
  const result = runFairSimulation(scenario, [], 0, 0, 3000);
  // Every year with at least one loss event exceeds a $0 tolerance.
  assert.ok(result.pExceedTolerance! > 0.5);
});

// ── Gate 2: reproducibility and single-estimator consistency ───────────────

const SCENARIO = {
  tefLambda: 12,
  vulnerability: 0.22,
  primaryLossMin: 1_200_000,
  primaryLossMode: 2_769_000,
  primaryLossMax: 5_400_000,
  secondaryLossProbability: 0.7,
  secondaryLossMin: 600_000,
  secondaryLossMode: 1_616_000,
  secondaryLossMax: 3_397_000,
};

test("M2 — the same seed reproduces a run exactly", () => {
  const a = runFairSimulation(SCENARIO, [], 50, 5_000_000, 2000, "fixed-seed");
  const b = runFairSimulation(SCENARIO, [], 50, 5_000_000, 2000, "fixed-seed");
  assert.equal(a.meanAle, b.meanAle);
  assert.equal(a.p90Ale, b.p90Ale);
  assert.equal(a.pExceedTolerance, b.pExceedTolerance);
  assert.equal(a.toleranceForGreen, b.toleranceForGreen);
});

test("M2 — different seeds give different runs, and the spread is within the reported error", () => {
  const runs = ["s1", "s2", "s3", "s4", "s5"].map((s) =>
    runFairSimulation(SCENARIO, [], 50, 5_000_000, 4000, s)
  );
  const means = runs.map((r) => r.meanAle);
  assert.ok(new Set(means).size > 1, "different seeds must not collapse to one run");

  // The spread between independent runs should sit within a few standard
  // errors — this is the check that makes the reported error meaningful.
  const spread = Math.max(...means) - Math.min(...means);
  assert.ok(spread < runs[0].seMeanAle * 12, `spread ${spread} vs se ${runs[0].seMeanAle}`);
});

test("M2 — every run carries its seed and engine version for re-derivation", () => {
  const r = runFairSimulation(SCENARIO, [], 50, null, 1000, "stamped");
  assert.equal(r.seed, "stamped");
  assert.match(r.engineVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(r.parameterSetVersion.length > 0);
});

test("M4 — toleranceForGreen IS p90Ale, not a second estimate of it", () => {
  const r = runFairSimulation(SCENARIO, [], 60, 5_000_000, 4000, "m4");
  assert.equal(r.toleranceForGreen, r.p90Ale);
});

test("M4 — feeding the engine's own P90 back as tolerance lands on the 10% bar", () => {
  const first = runFairSimulation(SCENARIO, [], 60, null, 4000, "m4-roundtrip");
  // Same seed, so the identical sample is re-scored against its own P90.
  const second = runFairSimulation(SCENARIO, [], 60, first.p90Ale, 4000, "m4-roundtrip");
  assert.ok(
    Math.abs((second.pExceedTolerance ?? 0) - 0.1) <= 1 / 4000,
    `expected ~10%, got ${second.pExceedTolerance}`
  );
});

test("M1 — the curve and the headline figure come from one estimator", () => {
  const r = runFairSimulation(SCENARIO, [], 55, null, 4000, "m1");
  // Re-score each curve point as a tolerance; the curve must agree exactly.
  for (const point of [r.lec[10], r.lec[60], r.lec[120], r.lec[200]]) {
    const rescored = runFairSimulation(SCENARIO, [], 55, point.loss, 4000, "m1");
    assert.equal(
      rescored.pExceedTolerance,
      point.probability,
      `curve and headline disagree at ${point.loss}`
    );
  }
});

test("M2 — reported standard errors are positive and shrink with more trials", () => {
  const small = runFairSimulation(SCENARIO, [], 50, 5_000_000, 1000, "se-small");
  const large = runFairSimulation(SCENARIO, [], 50, 5_000_000, 16000, "se-large");
  assert.ok(small.seMeanAle > 0 && large.seMeanAle > 0);
  assert.ok(large.seMeanAle < small.seMeanAle, "more trials must tighten the estimate");
  assert.ok((large.sePExceedTolerance ?? 1) < (small.sePExceedTolerance ?? 0) + 1e-9);
});
