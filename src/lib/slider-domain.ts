// A tolerance slider whose domain does not move under the user (audit P3).
//
// The finding: before any run the slider spanned $0–$20M; afterwards it spanned
// $0–(that run's largest simulated loss). The sample maximum is the single
// noisiest order statistic there is — it is whatever the worst of N draws
// happened to be — so both the ceiling AND the step changed after every run.
// A tolerance set by dragging could therefore land somewhere else next time,
// because the granularity underneath it had moved.
//
// The fix is not to freeze the domain (a $20M ceiling is useless for a scenario
// whose losses run to $200M) but to QUANTISE it, so it only changes when the
// order of magnitude genuinely changes rather than on sampling noise.
//
// Two decisions worth stating:
//
//  • Quantised onto a 1-2-5 ladder, the same progression used for chart axes.
//    Adjacent runs of the same scenario land on the same rung, so the ceiling
//    is stable; a genuinely different scenario moves it.
//  • Driven by P90 rather than the maximum. P90 is an order statistic with a
//    real standard error that shrinks with trials; the maximum has neither.
//    Using the max is what made the old domain noisy in the first place.

/** Smallest 1, 2 or 5 times a power of ten that is greater than or equal to `value`. */
export function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalised = value / magnitude;
  const rung = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return rung * magnitude;
}

/**
 * Headroom above P90 so the slider can express a tolerance well into the tail.
 * A ceiling AT P90 would make the most interesting settings unreachable.
 */
const HEADROOM = 3;

/** Steps across the track — 500 gives sub-percent granularity without jitter. */
const STEPS = 500;

export interface SliderDomain {
  max: number;
  step: number;
}

/**
 * @param p90 the run's 90th-percentile annual loss, or null before any run
 * @param fallbackMax the domain to use when there is no run yet
 */
export function toleranceSliderDomain(p90: number | null, fallbackMax: number): SliderDomain {
  const target = p90 !== null && p90 > 0 ? p90 * HEADROOM : fallbackMax;
  const max = niceCeiling(target);
  // The step is derived from the quantised ceiling, so it is stable for the
  // same reason the ceiling is — this is the half the finding was really
  // about, since a moving step silently relocates an already-set tolerance.
  return { max, step: Math.max(1, Math.round(max / STEPS)) };
}
