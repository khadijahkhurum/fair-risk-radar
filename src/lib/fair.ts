// FAIR (Factor Analysis of Information Risk) Monte Carlo engine.
//
// Model: for each simulated year, sample a threat event count from a Poisson
// distribution (Threat Event Frequency), then for each event roll against
// Vulnerability to decide if it becomes a loss event. Loss magnitude follows
// FAIR's actual taxonomy: Primary Loss (certain once a loss event occurs)
// plus a Secondary Loss (lost business/reputational) that only layers on
// some fraction of the time — not a single flat triangular range.
// Annualized Loss Expectancy (ALE) is the resulting per-year loss across all
// trials.
//
// Every draw comes from a SEEDED generator (audit M2). A run is identified by
// its seed and engine version, both persisted, so a stored assessment can be
// re-derived years later — which is what "audit-trailed" has to mean for a
// number that went into a budget decision.
//
// Every statistic returned here comes from the one sorted sample via
// src/lib/stats.ts (audit M1). There is no second estimator anywhere.
//
// ponytail: triangular approximation instead of Beta-PERT — FAIR practitioners
// often prefer PERT for its smoother tails, but triangular needs only
// min/mode/max (no shape-parameter tuning) and is within the same order of
// magnitude for this use case. Swap in a PERT sampler if precision matters
// more than defensibility-in-an-interview.
import type { Scenario } from "./scenarios";
// The catalogue itself, not just its type: partitioning needs the sum of
// multipliers over the whole population as its denominator (M10).
import { threats as threatCatalogue, type Threat } from "./threats";
import { createRng, newSeed, type Rng } from "./rng";
import {
  quantile,
  toleranceForGreen,
  exceedanceProbability,
  standardErrorOfMean,
  standardErrorOfProportion,
} from "./stats";

export const DEFAULT_TRIALS = 8000;
// The live what-if panel runs fewer trials because it re-simulates on every
// debounce tick. Exported (audit E3) so the UI cannot claim a trial count
// the engine is not running.
export const WHATIF_TRIALS = 4000;
const HISTOGRAM_BUCKETS = 24;
// Raised from 41 (audit M4): the curve is only a chart, the cost is one binary
// search per point, and a coarse grid was previously being inverted to answer
// "what tolerance would be green" — quantising that answer to ~$1M steps.
// Nothing reads an estimate off this grid any more, but a smooth chart is free.
export const LEC_POINTS = 240;

// Modeling assumption: average control coverage linearly reduces effective
// vulnerability, capped at a 70% reduction — controls mitigate but don't
// eliminate risk even at full nominal coverage. Documented, not sourced.
export const MAX_CONTROL_RISK_REDUCTION = 0.7;

// Stamped on every run, every persisted assessment and every export footer
// (audit G4). Bumped whenever a change would move the numbers.
export const ENGINE = {
  version: "3.0.0",
  parameterSetVersion: "ibm-2025-r2-partitioned",
  commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
} as const;

function sampleTriangular(rng: Rng, min: number, mode: number, max: number): number {
  const u = rng();
  const fc = (mode - min) / (max - min);
  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

// Knuth's algorithm — fine for the small lambdas (<30) used here.
function samplePoisson(rng: Rng, lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > l);
  return k - 1;
}

export interface HistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
}

export interface LecPoint {
  loss: number;
  probability: number; // P(annual loss > this value)
}

export interface FairResult {
  trials: number;
  seed: string;
  engineVersion: string;
  parameterSetVersion: string;
  meanAle: number;
  p10Ale: number;
  p50Ale: number;
  p90Ale: number;
  adjustedTefLambda: number;
  adjustedVulnerability: number;
  histogram: HistogramBucket[];
  lec: LecPoint[];
  /**
   * The sorted sample itself, in whole dollars.
   *
   * Shipped so the client can answer "what is P(loss > x)" for a tolerance the
   * user is dragging, using the SAME estimator the server used, rather than
   * interpolating a curve and producing a third answer (audit M1). Omitted
   * from the high-frequency what-if endpoint, where the payload would matter
   * and the server already returns the single figure that endpoint needs.
   */
  sortedLosses: number[];
  pExceedTolerance: number | null;
  /** The tolerance at which this posture sits exactly on the appetite bar. Equals p90Ale by construction (M4). */
  toleranceForGreen: number;
  /** Sampling error on the reported figures, so the UI can round honestly (M2). */
  seMeanAle: number;
  sePExceedTolerance: number | null;
}

type ScenarioInput = Pick<
  Scenario,
  | "tefLambda"
  | "vulnerability"
  | "primaryLossMin"
  | "primaryLossMode"
  | "primaryLossMax"
  | "secondaryLossProbability"
  | "secondaryLossMin"
  | "secondaryLossMode"
  | "secondaryLossMax"
>;
type ThreatInput = Pick<Threat, "tefMultiplier" | "vulnerabilityMultiplier">;

// Each selected threat is modeled as its own independent threat community
// (its own event stream against the scenario's baseline), and their losses
// are summed per simulated year. An empty array falls back to the
// scenario's unmodified baseline — one community at multiplier 1x/1x.
/**
 * Sum of tefMultiplier across the WHOLE catalogue — the partition denominator
 * (audit M10).
 *
 * The catalogue is the population: these communities are held to compose the
 * sector's all-cause threat event frequency, not to sit on top of it.
 */
export const PARTITION_BASIS = threatCatalogue.reduce((sum, t) => sum + t.tefMultiplier, 0);

/**
 * Split the scenario's all-cause threat event frequency AMONG the selected
 * communities, rather than scaling it by each of them (audit M10).
 *
 * The old model multiplied the sector baseline by every selected multiplier
 * and summed: selecting all five communities gave 5x the sector's frequency
 * and a mean ALE around $96M. Each community inherited a scaled copy of the
 * entire sector frequency rather than a share of it — so a CISO ticking all
 * five boxes because all five threats are real got six times the baseline for
 * doing the natural thing.
 *
 * Partitioned, lambda_i = lambda_base * (m_i / sum m). Selecting the full
 * catalogue reproduces the sector baseline exactly; selecting a subset means
 * "only these communities are in scope", which is correctly LESS than
 * all-cause, not more.
 *
 * Note what this does and does not normalise. Threat event FREQUENCY is
 * partitioned and sums back to the baseline by construction. Vulnerability
 * stays a per-community success rate and is still scaled, because it is not a
 * shared budget — two communities do not split a probability between them. So
 * the full catalogue reproduces the baseline's threat events exactly while its
 * LOSS events may differ slightly, reflecting the mix of success rates. That
 * is the intended behaviour and not a normalisation error.
 */
function resolveCommunities(threats: ThreatInput[]): ThreatInput[] {
  // No selection = the unpartitioned sector baseline, one community at 1x.
  // This is the all-cause figure, deliberately not broken down.
  if (threats.length === 0) return [{ tefMultiplier: 1, vulnerabilityMultiplier: 1 }];
  return threats.map((t) => ({
    tefMultiplier: t.tefMultiplier / PARTITION_BASIS,
    vulnerabilityMultiplier: t.vulnerabilityMultiplier,
  }));
}

export function runFairSimulation(
  scenario: ScenarioInput,
  threats: ThreatInput[],
  avgControlCoveragePct: number,
  riskTolerance: number | null = null,
  trials: number = DEFAULT_TRIALS,
  seed: string = newSeed()
): FairResult {
  const rng = createRng(seed);
  const coverageFraction = Math.min(Math.max(avgControlCoveragePct, 0), 100) / 100;
  const controlFactor = 1 - coverageFraction * MAX_CONTROL_RISK_REDUCTION;

  const communities = resolveCommunities(threats).map((t) => ({
    tefLambda: scenario.tefLambda * t.tefMultiplier,
    vulnerability: Math.min(scenario.vulnerability * t.vulnerabilityMultiplier * controlFactor, 1),
  }));
  // Reported back for the UI's methodology panel — sum of frequencies
  // across communities, and the coverage-weighted vulnerability of the
  // single most-successful community (the one driving most loss events).
  const adjustedTefLambda = communities.reduce((sum, c) => sum + c.tefLambda, 0);
  const adjustedVulnerability = Math.max(...communities.map((c) => c.vulnerability));

  const losses: number[] = new Array(trials);
  for (let t = 0; t < trials; t++) {
    let annualLoss = 0;
    for (const community of communities) {
      const eventCount = samplePoisson(rng, community.tefLambda);
      for (let e = 0; e < eventCount; e++) {
        if (rng() < community.vulnerability) {
          // Full FAIR loss magnitude: Primary Loss always applies once a loss
          // event occurs; Secondary Loss (lost business/reputational) only
          // layers on some fraction of the time.
          let eventLoss = sampleTriangular(rng, scenario.primaryLossMin, scenario.primaryLossMode, scenario.primaryLossMax);
          if (rng() < scenario.secondaryLossProbability) {
            eventLoss += sampleTriangular(
              rng,
              scenario.secondaryLossMin,
              scenario.secondaryLossMode,
              scenario.secondaryLossMax
            );
          }
          annualLoss += eventLoss;
        }
      }
    }
    // Whole dollars. Sub-dollar precision in a loss simulation is noise, and
    // rounding here means the client can re-score the SAME sample and get
    // bit-identical answers to the server (audit M1).
    losses[t] = Math.round(annualLoss);
  }

  losses.sort((a, b) => a - b);
  const meanAle = losses.reduce((sum, l) => sum + l, 0) / losses.length;
  const maxLoss = losses[losses.length - 1] || 1;

  const histogram: HistogramBucket[] = [];
  const bucketWidth = maxLoss / HISTOGRAM_BUCKETS;
  for (let b = 0; b < HISTOGRAM_BUCKETS; b++) {
    const rangeStart = b * bucketWidth;
    histogram.push({ rangeStart, rangeEnd: rangeStart + bucketWidth, count: 0 });
  }
  for (const loss of losses) {
    const idx = Math.min(Math.floor(loss / bucketWidth), HISTOGRAM_BUCKETS - 1);
    histogram[idx].count++;
  }

  // The curve is built from the SAME estimator as the headline figure, so the
  // chart and the number it sits next to cannot disagree (audit M1).
  const lec: LecPoint[] = [];
  for (let i = 0; i <= LEC_POINTS; i++) {
    const loss = (maxLoss * i) / LEC_POINTS;
    lec.push({ loss, probability: exceedanceProbability(losses, loss) });
  }

  const pExceedTolerance = riskTolerance !== null ? exceedanceProbability(losses, riskTolerance) : null;

  return {
    trials,
    seed,
    engineVersion: ENGINE.version,
    parameterSetVersion: ENGINE.parameterSetVersion,
    meanAle,
    p10Ale: quantile(losses, 0.1),
    p50Ale: quantile(losses, 0.5),
    p90Ale: quantile(losses, 0.9),
    adjustedTefLambda,
    adjustedVulnerability,
    histogram,
    lec,
    sortedLosses: losses,
    pExceedTolerance,
    toleranceForGreen: toleranceForGreen(losses),
    seMeanAle: standardErrorOfMean(losses),
    sePExceedTolerance:
      pExceedTolerance !== null ? standardErrorOfProportion(pExceedTolerance, losses.length) : null,
  };
}
