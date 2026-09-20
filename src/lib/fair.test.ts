// Unit tests for the FAIR Monte Carlo engine. Uses node's built-in test
// runner (via the tsx loader already in devDependencies) — no new test
// framework dependency for a handful of pure-function checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFairSimulation } from "./fair";

const scenario = {
  tefLambda: 10,
  vulnerability: 0.3,
  lossMin: 1_000_000,
  lossMode: 2_000_000,
  lossMax: 5_000_000,
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

test("adding a threat community never decreases adjustedTefLambda", () => {
  const baseline = runFairSimulation(scenario, [], 0, null, 500);
  const withThreat = runFairSimulation(
    scenario,
    [{ tefMultiplier: 2, vulnerabilityMultiplier: 1 }],
    0,
    null,
    500
  );
  assert.ok(withThreat.adjustedTefLambda > baseline.adjustedTefLambda);
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
