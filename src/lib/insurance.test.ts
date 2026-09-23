import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expectedRecovery,
  expectedRecoveryFromSample,
  retainedExceedProbability,
  retainedExceedProbabilityFromSample,
  tailReliability,
  totalCostOfRisk,
} from "./insurance";
import { exceedanceProbability } from "./stats";
import type { LecPoint } from "./lec";

// Uniform(0, 1000) losses: P(L > x) = 1 - x/1000.
const uniform: LecPoint[] = Array.from({ length: 41 }, (_, i) => {
  const loss = (1000 * i) / 40;
  return { loss, probability: 1 - loss / 1000 };
});

test("expectedRecovery matches the closed form for a uniform loss", () => {
  // E[min(max(L-A,0),Limit)] with A=200, Limit=300 over Uniform(0,1000):
  //   ∫_200^500 (1 - x/1000) dx = [x - x²/2000] = (500-125) - (200-20) = 195
  const got = expectedRecovery(uniform, { attachment: 200, limit: 300 });
  assert.ok(Math.abs(got - 195) < 1, `expected ~195, got ${got}`);
});

test("a full-cover layer recovers the whole expected loss", () => {
  // A=0, Limit=1000 → the entire mean, which is 500 for Uniform(0,1000).
  const got = expectedRecovery(uniform, { attachment: 0, limit: 1000 });
  assert.ok(Math.abs(got - 500) < 1, `expected ~500, got ${got}`);
});

test("no limit means no recovery", () => {
  assert.equal(expectedRecovery(uniform, { attachment: 100, limit: 0 }), 0);
});

test("insurance only helps above the attachment point", () => {
  const layer = { attachment: 200, limit: 300 };
  // Tolerance under the attachment: unchanged, you breach when gross does.
  const below = retainedExceedProbability(uniform, 100, layer)!;
  assert.ok(Math.abs(below - 0.9) < 1e-6, `expected 0.90, got ${below}`);
  // Tolerance at/above it: you only breach once the policy is exhausted,
  // i.e. gross > 300 + 300 = 600 → P = 1 - 600/1000 = 0.40.
  const above = retainedExceedProbability(uniform, 300, layer)!;
  assert.ok(Math.abs(above - 0.4) < 1e-6, `expected 0.40, got ${above}`);
});

test("transfer strictly reduces breach probability at/above the attachment", () => {
  const layer = { attachment: 200, limit: 300 };
  const gross = 1 - 400 / 1000; // P(L > 400) = 0.60
  const net = retainedExceedProbability(uniform, 400, layer)!;
  assert.ok(net < gross, `insured ${net} should beat uninsured ${gross}`);
});

test("totalCostOfRisk sums the three levers", () => {
  assert.equal(totalCostOfRisk(100, 50, 25), 175);
});

// ── M8: exact sample-based layer pricing ────────────────────────────────────

test("M8 — expected recovery is EXACT for the sample, not an approximation", () => {
  // Five known years make the right answer checkable by hand rather than by
  // reference to another implementation.
  const losses = [0, 1_000_000, 5_000_000, 10_000_000, 20_000_000];
  const layer = { attachment: 4_000_000, limit: 8_000_000 };
  // payouts: 0, 0, 1M, 6M, 8M  →  15M / 5 = 3M
  assert.equal(expectedRecoveryFromSample(losses, layer), 3_000_000);
});

test("M8 — the limit caps each year's payout, so a fat tail cannot inflate the price", () => {
  const modest = [0, 0, 0, 0, 10_000_000];
  const extreme = [0, 0, 0, 0, 500_000_000];
  const layer = { attachment: 1_000_000, limit: 2_000_000 };
  // Both years blow through the limit, so both pay exactly the limit.
  assert.equal(expectedRecoveryFromSample(modest, layer), expectedRecoveryFromSample(extreme, layer));
  assert.equal(expectedRecoveryFromSample(modest, layer), 2_000_000 / 5);
});

test("M8 — the curve-integrated estimate was biased HIGH against the exact answer", () => {
  // The finding's first bias: trapezoids over a convex exceedance curve sit
  // above it. This pins the direction rather than merely asserting they differ.
  const losses: number[] = [];
  for (let i = 1; i <= 2000; i++) losses.push(Math.round(1_000_000 * (2000 / i) ** 0.7));
  losses.sort((a, b) => a - b);

  const lec: LecPoint[] = [];
  const maxLoss = losses[losses.length - 1];
  for (let i = 0; i <= 240; i++) {
    const loss = (maxLoss * i) / 240;
    let above = 0;
    for (const l of losses) if (l > loss) above++;
    lec.push({ loss, probability: above / losses.length });
  }

  const layer = { attachment: 2_000_000, limit: 20_000_000 };
  const exact = expectedRecoveryFromSample(losses, layer);
  const integrated = expectedRecovery(lec, layer);
  assert.ok(exact > 0 && integrated > 0);
  assert.ok(
    integrated >= exact,
    `trapezoid ${integrated} should not sit below the exact ${exact}`
  );
});

test("M8 — an attachment above the worst simulated year is flagged, not priced as cheap", () => {
  const losses = [0, 1_000_000, 5_000_000];
  const layer = { attachment: 50_000_000, limit: 10_000_000 };
  assert.equal(expectedRecoveryFromSample(losses, layer), 0);

  const tail = tailReliability(losses, layer);
  assert.equal(tail.extrapolated, true);
  assert.equal(tail.yearsAboveAttachment, 0);
  assert.match(tail.warning ?? "", /unpriced, not cheap/);
});

test("M8 — a thin tail is flagged even when the price is non-zero", () => {
  const losses = Array.from({ length: 1000 }, (_, i) => (i < 995 ? 1_000_000 : 40_000_000));
  const tail = tailReliability(losses, { attachment: 30_000_000, limit: 5_000_000 });
  assert.equal(tail.yearsAboveAttachment, 5);
  assert.equal(tail.extrapolated, true);
  assert.match(tail.warning ?? "", /handful of draws/);
});

test("M8 — a layer the sample only partly covers says the price is a lower bound", () => {
  const losses = Array.from({ length: 1000 }, (_, i) => (i % 2 === 0 ? 1_000_000 : 12_000_000));
  const tail = tailReliability(losses, { attachment: 2_000_000, limit: 50_000_000 });
  assert.ok(tail.yearsAboveAttachment >= 20, "enough exceedances to clear the thin-tail rule");
  assert.ok(tail.layerCoverage < 1);
  assert.match(tail.warning ?? "", /lower bound/);
});

test("M8 — a well-covered layer raises no warning", () => {
  const losses = Array.from({ length: 1000 }, (_, i) => i * 100_000);
  const tail = tailReliability(losses, { attachment: 10_000_000, limit: 20_000_000 });
  assert.equal(tail.extrapolated, false);
  assert.equal(tail.warning, null);
});

test("M8/M1 — gross and net exceedance now come from ONE estimator", () => {
  const losses = Array.from({ length: 1000 }, (_, i) => i * 10_000).sort((a, b) => a - b);
  const tolerance = 5_000_000;
  const layer = { attachment: 3_000_000, limit: 2_000_000 };

  const gross = exceedanceProbability(losses, tolerance);
  const net = retainedExceedProbabilityFromSample(losses, tolerance, layer);
  assert.ok(net !== null);
  // Both are order statistics of the same sample, so the improvement is the
  // policy's rather than an artefact of mixing a sample with a curve.
  assert.equal(net, exceedanceProbability(losses, tolerance + layer.limit));
  assert.ok(net! <= gross);
});

test("M8 — no limit means no recovery and no tail claim", () => {
  const losses = [1_000_000, 2_000_000];
  assert.equal(expectedRecoveryFromSample(losses, { attachment: 0, limit: 0 }), 0);
  assert.equal(tailReliability(losses, { attachment: 0, limit: 0 }).layerCoverage, 0);
});
