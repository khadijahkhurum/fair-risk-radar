// The estimators. ONE definition of each, used everywhere (audit M1, M2, M4).
//
// The tool previously computed P(loss > tolerance) three different ways in
// three places — client-side interpolation of a 41-point curve, the server's
// raw-sample fraction, and the persisted value — and they disagreed by about a
// percentage point at a 10% decision boundary. Every function below takes the
// sorted raw sample, so there is one number on screen, in the export, and in
// the database.

/** The pass mark: breaching your stated appetite more than one year in ten. */
export const GREEN_THRESHOLD = 0.1;

/**
 * The loss exceeded in exactly (1 - p) of simulated years.
 *
 * ONE definition, used for the P90 tile AND for "what tolerance would be
 * green". M4: those are the same statistic, were computed two different ways,
 * and disagreed on screen by $53,164. Sharing this function makes them
 * identical by construction rather than by coincidence.
 */
export function quantile(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const clamped = Math.min(Math.max(p, 0), 1);
  return sortedAscending[Math.floor(clamped * (sortedAscending.length - 1))];
}

/** The tolerance at which this posture sits exactly on the appetite bar. */
export function toleranceForGreen(sortedAscending: readonly number[]): number {
  return quantile(sortedAscending, 1 - GREEN_THRESHOLD);
}

/**
 * P(loss > tolerance), as the exact empirical fraction of the sample.
 *
 * Binary search for the first index strictly greater than tolerance, so this
 * is O(log n) and exact for the sample — no interpolation, no grid.
 */
export function exceedanceProbability(sortedAscending: readonly number[], tolerance: number): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedAscending[mid] > tolerance) hi = mid;
    else lo = mid + 1;
  }
  return (n - lo) / n;
}

/** Standard error of the mean — how far the reported mean ALE can be from the true one. */
export function standardErrorOfMean(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1);
  return Math.sqrt(variance / n);
}

/** Standard error of a proportion — the binomial one, for exceedance probabilities. */
export function standardErrorOfProportion(p: number, n: number): number {
  if (n < 1) return 0;
  return Math.sqrt((p * (1 - p)) / n);
}

/**
 * Round to the precision the estimate actually supports (audit M2c).
 *
 * The UI rendered `$7,373,738` and `56.65%` on figures carrying roughly
 * ±$150,000 and ±0.8pp of sampling noise — four significant figures of
 * displayed precision on about one significant figure of accuracy. False
 * precision is what makes executives trust an output, so it is the most
 * corrosive thing a risk tool can do.
 */
export function significantDigitsFor(standardError: number, value: number): number {
  if (!Number.isFinite(standardError) || standardError <= 0) return 2;
  // Keep one digit finer than the error itself, floored at whole units.
  const magnitude = Math.floor(Math.log10(Math.abs(standardError)));
  const valueMagnitude = Number.isFinite(value) && value !== 0 ? Math.floor(Math.log10(Math.abs(value))) : 0;
  return Math.max(0, Math.min(6, valueMagnitude - magnitude + 1));
}

/** A 95% interval, for rendering "57% ± 0.9pp" instead of "56.65%". */
export function confidenceInterval95(estimate: number, standardError: number): { low: number; high: number; margin: number } {
  const margin = 1.96 * standardError;
  return { low: estimate - margin, high: estimate + margin, margin };
}

// ── Honest display (audit M2c) ─────────────────────────────────────────────
//
// The UI rendered $7,373,738 and 56.65% on figures carrying roughly ±$150,000
// and ±0.8pp. These render the interval instead of the false point.

/** "57.0% ± 0.9pp" — precision follows the error, not the float. */
export function formatPercentWithError(p: number, standardError: number): string {
  const marginPp = 1.96 * standardError * 100;
  // One decimal place while the margin is coarser than 0.05pp, two below that.
  const decimals = marginPp >= 0.05 ? 1 : 2;
  return `${(p * 100).toFixed(decimals)}% ± ${marginPp.toFixed(decimals)}pp`;
}

/** "$7.4M ± $0.3M" — never dollar-exact on a sampled figure. */
export function formatMoneyWithError(value: number, standardError: number): string {
  const margin = 1.96 * standardError;
  const compact = (v: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  return `${compact(value)} ± ${compact(margin)}`;
}

/**
 * Whether two sampled estimates are distinguishable at all.
 *
 * Used to suppress verdicts whose difference sits inside the noise (M3, M7) —
 * "this control investment pays for itself" must not be asserted when the sign
 * of the difference flips between runs.
 */
export function separated(aEstimate: number, aSe: number, bEstimate: number, bSe: number): boolean {
  const combined = Math.sqrt(aSe * aSe + bSe * bSe);
  return Math.abs(aEstimate - bEstimate) > 1.96 * combined;
}

/**
 * The single precision policy for percentages (audit M12).
 *
 * The same statistic used to render three ways: 56.65% in the UI, 80.3% in the
 * CSV, and 80.30% in an audit-trail string. All three claimed a precision the
 * simulation does not have, and they disagreed with each other about which.
 *
 * Every surface now calls this. Where the sampling error is known it drives
 * the displayed digits (M2's rule: never show precision you do not have).
 * Where it is not, two decimals is the stated house style rather than an
 * accident of whichever toFixed the caller reached for.
 */
export function formatPercent(value: number | null, standardError?: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (standardError !== null && standardError !== undefined && standardError > 0) {
    return formatPercentWithError(value, standardError);
  }
  return `${(value * 100).toFixed(2)}%`;
}
