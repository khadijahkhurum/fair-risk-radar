// Risk TRANSFER — the leg of FAIR this tool was missing.
//
// A cyber policy is an excess-of-loss layer: you retain everything up to the
// attachment point (the retention/deductible), the insurer pays the next
// `limit` of loss, and anything above attachment+limit falls back on you.
//
//   retained(gross) = gross - min(max(gross - attachment, 0), limit)
//
// Everything below is derived from the Loss Exceedance Curve the simulation
// already produces, so pricing a layer costs zero extra Monte Carlo runs.
import { interpolateLec, type LecPoint } from "./lec";
import { exceedanceProbability } from "./stats";

export interface Layer {
  attachment: number; // retention / deductible
  limit: number; // most the policy will pay in a year
}

/**
 * Expected annual recovery from the layer, computed directly from the raw
 * sample (audit M8).
 *
 * E[min(max(L-A,0), Limit)] is the payout definition itself — averaged over
 * the sampled years it needs no integration at all, and it is EXACT for the
 * sample rather than an approximation of it.
 *
 * What this replaces, and why it mattered: the previous implementation
 * integrated the exceedance curve with the trapezoid rule. That carried two
 * undisclosed biases pushing in opposite directions, so they did not cancel
 * predictably.
 *
 *  1. Trapezoids over a convex curve sit ABOVE it, systematically
 *     overestimating the integral, the recovery and the loaded premium.
 *  2. The curve stops at the largest simulated year, so every loss beyond the
 *     worst of N sampled years contributed exactly zero — and an
 *     excess-of-loss layer is entirely a tail instrument, so this understated
 *     precisely the high-attachment layers people actually buy.
 *
 * Bias (1) is gone: this is not an approximation. Bias (2) is INHERENT to a
 * finite sample, not to the method — no estimator can see beyond the sample's
 * maximum. It is now surfaced instead of hidden, via `tailReliability` below.
 */
export function expectedRecoveryFromSample(
  sortedLosses: readonly number[],
  { attachment, limit }: Layer
): number {
  if (sortedLosses.length === 0 || limit <= 0) return 0;
  const lo = Math.max(attachment, 0);
  let sum = 0;
  for (const loss of sortedLosses) sum += Math.min(Math.max(loss - lo, 0), limit);
  return sum / sortedLosses.length;
}

/**
 * How much of this layer the sample can actually speak to (audit M8).
 *
 * A layer whose attachment sits near or above the worst simulated year is
 * priced almost entirely on years the simulation never produced, so the
 * premium is an extrapolation dressed as a number. The honest response is to
 * say so rather than to quietly return a confident near-zero.
 *
 * ponytail: no generalised Pareto fit for the far tail. A GPD needs a
 * threshold choice and a shape parameter that would themselves need
 * validating, and an unvalidated fitted tail is a worse lie than a stated
 * limitation. Fit one when there is loss data to validate it against — the
 * warning below is the honest interim.
 */
export interface TailReliability {
  /** Years in the sample that reached the attachment at all. */
  yearsAboveAttachment: number;
  /** Largest year the simulation produced. */
  maxSimulatedLoss: number;
  /** Fraction of the layer's width the sample actually covers, 0..1. */
  layerCoverage: number;
  /** True when the price rests on too few sampled years to be meaningful. */
  extrapolated: boolean;
  warning: string | null;
}

/** Below this many exceedances the price is driven by a handful of draws. */
const MIN_TAIL_YEARS = 20;

export function tailReliability(
  sortedLosses: readonly number[],
  { attachment, limit }: Layer
): TailReliability {
  const maxSimulatedLoss = sortedLosses.length > 0 ? sortedLosses[sortedLosses.length - 1] : 0;
  const lo = Math.max(attachment, 0);
  let yearsAboveAttachment = 0;
  for (const loss of sortedLosses) if (loss > lo) yearsAboveAttachment++;

  const layerCoverage =
    limit <= 0 ? 0 : Math.min(Math.max((maxSimulatedLoss - lo) / limit, 0), 1);

  let warning: string | null = null;
  if (lo >= maxSimulatedLoss) {
    warning = `The attachment sits above the worst of ${sortedLosses.length.toLocaleString()} simulated years (${Math.round(
      maxSimulatedLoss
    ).toLocaleString()}). No simulated year reaches this layer, so its price is zero by construction rather than by evidence — treat it as unpriced, not cheap.`;
  } else if (yearsAboveAttachment < MIN_TAIL_YEARS) {
    warning = `Only ${yearsAboveAttachment} of ${sortedLosses.length.toLocaleString()} simulated years reach this attachment, so the price rests on a handful of draws and will move materially between runs. Raise the trial count or lower the attachment before quoting it.`;
  } else if (layerCoverage < 1) {
    warning = `The simulation's worst year only reaches ${Math.round(
      layerCoverage * 100
    )}% of the way through this layer, so the upper part of the limit is priced on no data at all. Expected recovery here is a lower bound.`;
  }

  return {
    yearsAboveAttachment,
    maxSimulatedLoss,
    layerCoverage,
    extrapolated: warning !== null,
    warning,
  };
}

/**
 * @deprecated Curve-integrated pricing (audit M8). Kept only because removing
 * it would silently change any caller that still reads it; every caller in
 * this repo now uses expectedRecoveryFromSample. Delete once nothing imports
 * it.
 */
export function expectedRecovery(lec: LecPoint[], { attachment, limit }: Layer): number {
  if (lec.length === 0 || limit <= 0) return 0;
  const lo = Math.max(attachment, 0);
  const hi = lo + limit;

  const xs = new Set<number>([lo, hi]);
  for (const p of lec) if (p.loss > lo && p.loss < hi) xs.add(p.loss);
  const grid = Array.from(xs).sort((a, b) => a - b);

  let area = 0;
  for (let i = 0; i < grid.length - 1; i++) {
    const x0 = grid[i];
    const x1 = grid[i + 1];
    const p0 = interpolateLec(lec, x0) ?? 0;
    const p1 = interpolateLec(lec, x1) ?? 0;
    area += ((p0 + p1) / 2) * (x1 - x0);
  }
  return area;
}

// P(retained loss > tolerance) once the layer is in place.
//
// retained(gross) is monotonic and piecewise linear, so the threshold maps
// back to a single gross-loss level and we can just read the LEC there — no
// re-simulation:
//   • tolerance below the attachment point → the layer never helps at that
//     threshold; you breach exactly when gross loss does.
//   • tolerance at or above it → inside the layer retained loss is pinned at
//     the attachment, so you only breach once gross exceeds tolerance + limit
//     (i.e. once the policy is exhausted).
export function retainedExceedProbability(
  lec: LecPoint[],
  tolerance: number,
  { attachment, limit }: Layer
): number | null {
  if (lec.length === 0) return null;
  if (limit <= 0) return interpolateLec(lec, tolerance);
  const threshold = tolerance < attachment ? tolerance : tolerance + limit;
  return interpolateLec(lec, threshold);
}

/**
 * The same question answered from the raw sample (audit M8's inherited M1).
 *
 * The transfer page showed a gross figure taken from the raw sample beside a
 * net figure taken from the interpolated curve, then reported the difference
 * as the benefit of insurance. About a percentage point of that "benefit" was
 * an artefact of using two different estimators. Both sides now come from the
 * one sorted sample, so the improvement is the policy's and nothing else.
 */
export function retainedExceedProbabilityFromSample(
  sortedLosses: readonly number[],
  tolerance: number,
  { attachment, limit }: Layer
): number | null {
  if (sortedLosses.length === 0) return null;
  if (limit <= 0) return exceedanceProbability(sortedLosses, tolerance);
  const threshold = tolerance < attachment ? tolerance : tolerance + limit;
  return exceedanceProbability(sortedLosses, threshold);
}

// Insurers charge more than the expected payout — that margin covers their
// capital, expenses and profit. 1.4x is a plausible mid-market cyber loading
// for a demo, not a quoted rate; the page lets you type a real premium.
export const DEFAULT_PREMIUM_LOADING = 1.4;

export function indicativePremium(expectedPayout: number, loading = DEFAULT_PREMIUM_LOADING): number {
  return expectedPayout * loading;
}

// Total Cost of Risk: what the year actually costs you across all three
// levers — what you spend on controls, what you spend on the policy, and the
// loss you still expect to eat yourself.
export function totalCostOfRisk(controlSpend: number, premium: number, retainedExpectedLoss: number): number {
  return controlSpend + premium + retainedExpectedLoss;
}
