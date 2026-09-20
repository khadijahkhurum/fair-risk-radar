import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedRecovery, retainedExceedProbability, totalCostOfRisk } from "./insurance";
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
