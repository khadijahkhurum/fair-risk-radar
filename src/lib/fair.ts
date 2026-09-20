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
// ponytail: triangular approximation instead of Beta-PERT — FAIR practitioners
// often prefer PERT for its smoother tails, but triangular needs only
// min/mode/max (no shape-parameter tuning) and is within the same order of
// magnitude for this use case. Swap in a PERT sampler if precision matters
// more than defensibility-in-an-interview.
import type { Scenario } from "./scenarios";
import type { Threat } from "./threats";

const DEFAULT_TRIALS = 8000;
const HISTOGRAM_BUCKETS = 24;
const LEC_POINTS = 40;

// Modeling assumption: average control coverage linearly reduces effective
// vulnerability, capped at a 70% reduction — controls mitigate but don't
// eliminate risk even at full nominal coverage. Documented, not sourced.
const MAX_CONTROL_RISK_REDUCTION = 0.7;

function sampleTriangular(min: number, mode: number, max: number): number {
  const u = Math.random();
  const fc = (mode - min) / (max - min);
  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

// Knuth's algorithm — fine for the small lambdas (<30) used here.
function samplePoisson(lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
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
  meanAle: number;
  p10Ale: number;
  p50Ale: number;
  p90Ale: number;
  adjustedTefLambda: number;
  adjustedVulnerability: number;
  histogram: HistogramBucket[];
  lec: LecPoint[];
  pExceedTolerance: number | null;
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
function resolveCommunities(threats: ThreatInput[]): ThreatInput[] {
  return threats.length > 0 ? threats : [{ tefMultiplier: 1, vulnerabilityMultiplier: 1 }];
}

export function runFairSimulation(
  scenario: ScenarioInput,
  threats: ThreatInput[],
  avgControlCoveragePct: number,
  riskTolerance: number | null = null,
  trials: number = DEFAULT_TRIALS
): FairResult {
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
      const eventCount = samplePoisson(community.tefLambda);
      for (let e = 0; e < eventCount; e++) {
        if (Math.random() < community.vulnerability) {
          // Full FAIR loss magnitude: Primary Loss always applies once a loss
          // event occurs; Secondary Loss (lost business/reputational) only
          // layers on some fraction of the time.
          let eventLoss = sampleTriangular(scenario.primaryLossMin, scenario.primaryLossMode, scenario.primaryLossMax);
          if (Math.random() < scenario.secondaryLossProbability) {
            eventLoss += sampleTriangular(
              scenario.secondaryLossMin,
              scenario.secondaryLossMode,
              scenario.secondaryLossMax
            );
          }
          annualLoss += eventLoss;
        }
      }
    }
    losses[t] = annualLoss;
  }

  losses.sort((a, b) => a - b);
  const percentile = (p: number) => losses[Math.floor(p * (losses.length - 1))];
  const meanAle = losses.reduce((sum, l) => sum + l, 0) / losses.length;
  const maxLoss = losses[losses.length - 1] || 1;

  const histogram: HistogramBucket[] = [];
  const bucketWidth = maxLoss / HISTOGRAM_BUCKETS;
  for (let b = 0; b < HISTOGRAM_BUCKETS; b++) {
    const rangeStart = b * bucketWidth;
    const rangeEnd = rangeStart + bucketWidth;
    histogram.push({ rangeStart, rangeEnd, count: 0 });
  }
  for (const loss of losses) {
    const idx = Math.min(Math.floor(loss / bucketWidth), HISTOGRAM_BUCKETS - 1);
    histogram[idx].count++;
  }

  // Loss Exceedance Curve: P(annual loss > x) for x sweeping 0..maxLoss.
  const lec: LecPoint[] = [];
  for (let i = 0; i <= LEC_POINTS; i++) {
    const loss = (maxLoss * i) / LEC_POINTS;
    let exceedCount = 0;
    for (let j = losses.length - 1; j >= 0 && losses[j] > loss; j--) exceedCount++;
    lec.push({ loss, probability: exceedCount / losses.length });
  }

  const pExceedTolerance =
    riskTolerance !== null
      ? losses.filter((l) => l > riskTolerance).length / losses.length
      : null;

  return {
    trials,
    meanAle,
    p10Ale: percentile(0.1),
    p50Ale: percentile(0.5),
    p90Ale: percentile(0.9),
    adjustedTefLambda,
    adjustedVulnerability,
    histogram,
    lec,
    pExceedTolerance,
  };
}
