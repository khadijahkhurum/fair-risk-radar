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

export interface Layer {
  attachment: number; // retention / deductible
  limit: number; // most the policy will pay in a year
}

// Expected annual recovery from the layer.
//
// For a non-negative loss, E[min(max(L-A,0), Limit)] is the area under the
// exceedance curve between A and A+Limit — the standard layer-pricing
// identity, since E[(L-A)+] = ∫_A^∞ P(L > x) dx. Integrated with the
// trapezoid rule over the LEC's own grid plus the two layer boundaries, so
// the endpoints are exact rather than snapped to whichever grid point is
// nearest.
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
