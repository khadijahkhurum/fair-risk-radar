import { test } from "node:test";
import assert from "node:assert/strict";
import { niceCeiling, toleranceSliderDomain } from "./slider-domain";

test("P3 — niceCeiling lands on the 1-2-5 ladder", () => {
  assert.equal(niceCeiling(1), 1);
  assert.equal(niceCeiling(1.5), 2);
  assert.equal(niceCeiling(2), 2);
  assert.equal(niceCeiling(3), 5);
  assert.equal(niceCeiling(5), 5);
  assert.equal(niceCeiling(6), 10);
  assert.equal(niceCeiling(10), 10);
  assert.equal(niceCeiling(41_500_000), 50_000_000);
  assert.equal(niceCeiling(12_000_000), 20_000_000);
});

test("P3 — niceCeiling never returns less than its input", () => {
  for (const v of [1, 7, 99, 101, 999, 1001, 4_999_999, 123_456_789]) {
    assert.ok(niceCeiling(v) >= v, `${v} -> ${niceCeiling(v)}`);
  }
});

test("P3 — degenerate inputs do not produce a zero or negative domain", () => {
  // A zero step would freeze the slider; a zero max would collapse it.
  for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.ok(niceCeiling(v) > 0, `${v} -> ${niceCeiling(v)}`);
  }
  const d = toleranceSliderDomain(0, 20_000_000);
  assert.ok(d.max > 0 && d.step > 0);
});

test("P3 — THE FINDING: run-to-run sampling noise does not move the domain", () => {
  // Five runs of the same scenario, P90 wobbling by a few percent the way a
  // Monte Carlo estimate actually does. Under the old rule the ceiling was the
  // sample maximum, so it moved every single time — and the step with it.
  const noisyP90s = [13_900_000, 14_200_000, 13_750_000, 14_410_000, 14_050_000];
  const domains = noisyP90s.map((p) => toleranceSliderDomain(p, 20_000_000));
  const first = domains[0];
  for (const d of domains) {
    assert.equal(d.max, first.max, "ceiling moved on sampling noise");
    assert.equal(d.step, first.step, "step moved on sampling noise — this relocates a set tolerance");
  }
});

test("P3 — a genuinely different scenario DOES move the domain", () => {
  // Stability must not mean insensitivity: an order-of-magnitude difference
  // has to be reachable, or the slider cannot express a real tolerance.
  const small = toleranceSliderDomain(500_000, 20_000_000);
  const large = toleranceSliderDomain(90_000_000, 20_000_000);
  assert.ok(large.max > small.max * 10);
});

test("P3 — the ceiling leaves headroom above P90 so the tail is reachable", () => {
  const p90 = 14_000_000;
  const { max } = toleranceSliderDomain(p90, 20_000_000);
  assert.ok(max > p90, "a tolerance at or above P90 must be settable");
});

test("P3 — with no run yet the domain comes from the fallback, not from nothing", () => {
  const { max, step } = toleranceSliderDomain(null, 20_000_000);
  assert.equal(max, 20_000_000);
  assert.equal(step, 40_000);
});

test("P3 — the step always divides the track into usable increments", () => {
  for (const p90 of [100_000, 1_000_000, 14_000_000, 250_000_000]) {
    const { max, step } = toleranceSliderDomain(p90, 20_000_000);
    const increments = max / step;
    assert.ok(increments >= 100 && increments <= 1000, `${p90}: ${increments} increments`);
  }
});
