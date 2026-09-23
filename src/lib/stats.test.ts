import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GREEN_THRESHOLD,
  quantile,
  toleranceForGreen,
  exceedanceProbability,
  standardErrorOfMean,
  standardErrorOfProportion,
  confidenceInterval95,
  significantDigitsFor,
  formatPercentWithError,
  formatMoneyWithError,
  separated,
  formatPercent,
} from "./stats";

// 1..1000 ascending — quantiles and exceedances are known exactly.
const sample = Array.from({ length: 1000 }, (_, i) => i + 1);

test("quantile picks the expected order statistic", () => {
  assert.equal(quantile(sample, 0), 1);
  assert.equal(quantile(sample, 1), 1000);
  assert.equal(quantile(sample, 0.5), sample[Math.floor(0.5 * 999)]);
});

test("exceedanceProbability is exact for the sample", () => {
  assert.equal(exceedanceProbability(sample, 900), 100 / 1000);
  assert.equal(exceedanceProbability(sample, 0), 1);
  assert.equal(exceedanceProbability(sample, 1000), 0);
  assert.equal(exceedanceProbability(sample, 99999), 0);
});

test("M4 — P90 and the go-green tolerance are the SAME number", () => {
  // These were computed two different ways and disagreed by $53,164 on screen.
  assert.equal(toleranceForGreen(sample), quantile(sample, 1 - GREEN_THRESHOLD));
  assert.equal(toleranceForGreen(sample), quantile(sample, 0.9));
});

test("M4 — typing the displayed P90 into the tolerance box lands on the bar", () => {
  // The audit's exact repro: entering the P90 figure returned 9.92%, not 10%.
  const p90 = quantile(sample, 0.9);
  const p = exceedanceProbability(sample, p90);
  assert.ok(Math.abs(p - GREEN_THRESHOLD) <= 1 / sample.length, `got ${p}, expected ~${GREEN_THRESHOLD}`);
});

test("the M4 property holds across sample sizes and shapes", () => {
  for (const n of [500, 4000, 8000]) {
    // A skewed sample, closer to a real loss distribution than a uniform one.
    const skewed = Array.from({ length: n }, (_, i) => Math.pow(i / n, 3) * 5e7).sort((a, b) => a - b);
    const p = exceedanceProbability(skewed, toleranceForGreen(skewed));
    assert.ok(Math.abs(p - GREEN_THRESHOLD) <= 1 / n + 1e-9, `n=${n}: got ${p}`);
  }
});

test("exceedance is monotonically non-increasing in tolerance", () => {
  let previous = 1;
  for (let t = 0; t <= 1000; t += 25) {
    const p = exceedanceProbability(sample, t);
    assert.ok(p <= previous + 1e-12, `not monotone at ${t}`);
    previous = p;
  }
});

test("standard error of the mean shrinks as sqrt(n)", () => {
  // The distribution must be held constant: slicing an ascending range would
  // change the variance as well as n, and the error would grow instead.
  // Repeating the sample keeps the shape identical and only multiplies n.
  const once = standardErrorOfMean(sample);
  const fourTimes = standardErrorOfMean([...sample, ...sample, ...sample, ...sample]);
  assert.ok(fourTimes < once, "more trials must reduce the error");
  // 4x the trials halves the error, to within the (n-1) correction.
  assert.ok(Math.abs(once / fourTimes - 2) < 0.02, `ratio ${once / fourTimes}`);
});

test("standard error of a proportion matches the binomial form", () => {
  assert.ok(Math.abs(standardErrorOfProportion(0.5, 4000) - Math.sqrt(0.25 / 4000)) < 1e-12);
  // Maximal at p = 0.5, zero at the extremes.
  assert.ok(standardErrorOfProportion(0.5, 100) > standardErrorOfProportion(0.1, 100));
  assert.equal(standardErrorOfProportion(0, 100), 0);
});

test("a 95% interval brackets the estimate symmetrically", () => {
  const ci = confidenceInterval95(0.57, 0.008);
  assert.ok(Math.abs(ci.margin - 1.96 * 0.008) < 1e-12);
  assert.ok(ci.low < 0.57 && ci.high > 0.57);
});

test("M2 — displayed precision follows the standard error, not the float", () => {
  // ±$150k on ~$7.4M: thousands are noise, so do not print them.
  assert.ok(significantDigitsFor(150_000, 7_373_738) <= 2);
  // A tight estimate earns more digits.
  assert.ok(significantDigitsFor(50, 7_373_738) > significantDigitsFor(150_000, 7_373_738));
});

test("M2c — a percentage renders with its interval, not as a false point", () => {
  const s = formatPercentWithError(0.5665, 0.0079);
  // One decimal on the estimate, one on the margin. Not asserting the exact
  // digit: 56.65 is 56.6499... in binary, so toFixed(1) legitimately gives
  // 56.6 rather than 56.7.
  assert.match(s, /^56\.[67]% ± 1\.5pp$/, s);
  assert.ok(!s.includes("56.65"), "must not print precision the estimate lacks");
});

test("M2c — money renders compactly with its margin", () => {
  const s = formatMoneyWithError(7_373_738, 150_000);
  assert.ok(s.includes("±"), s);
  assert.ok(!s.includes("7,373,738"), "must not print dollar-exact sampled figures");
});

test("M3/M7 — estimates inside the noise are not treated as separated", () => {
  // Two runs 50k apart with 200k of combined error: indistinguishable.
  assert.equal(separated(7_400_000, 150_000, 7_450_000, 150_000), false);
  // A genuine gap well outside the error.
  assert.equal(separated(7_400_000, 150_000, 9_000_000, 150_000), true);
});

test("M12 — one precision policy: error-aware where the error is known", () => {
  // With a standard error, the displayed digits follow it (M2's rule), and
  // the margin quoted is the 95% interval half-width (1.96 x SE), not the raw
  // standard error — 0.015 SE is +/- 2.9pp, which is the number a reader
  // should act on.
  assert.match(formatPercent(0.566, 0.015), /^56\.6% ± 2\.9pp$/);
  // Without one, a single house style rather than whichever toFixed the
  // calling surface happened to reach for — the UI, the CSV and the audit
  // detail used to say 56.65%, 80.3% and 80.30% for the same kind of figure.
  assert.equal(formatPercent(0.8031), "80.31%");
  assert.equal(formatPercent(0.1), "10.00%");
});

test("M12 — an absent value renders as absent, not as zero", () => {
  // A risk tool that prints 0.00% where it has no number is asserting safety
  // it cannot support.
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(Number.NaN), "—");
  assert.equal(formatPercent(Number.POSITIVE_INFINITY), "—");
});

test("M12 — a zero or absent standard error falls back rather than claiming certainty", () => {
  assert.equal(formatPercent(0.25, 0), "25.00%");
  assert.equal(formatPercent(0.25, null), "25.00%");
  assert.equal(formatPercent(0.25, undefined), "25.00%");
});
