/**
 * FAIR (Factor Analysis of Information Risk) Monte Carlo engine.
 *
 * Loss Event Frequency = Threat Event Frequency × Vulnerability
 * Loss Magnitude        = Primary Loss + (Secondary Loss Probability × Secondary Loss Magnitude)
 *
 * Each factor is sampled from a triangular distribution (a lighter stand-in for
 * the Beta-PERT distributions a full FAIR tool would use — see the README for
 * where this simplifies real practice). This runs server-side so a simulation's
 * result can be persisted as a RiskAssessment row, giving the app an audit trail
 * a client-only version can't have.
 */

export interface Triangular {
  min: number;
  mode: number;
  max: number;
}

export interface FairProfile {
  tef: Triangular; // Threat Event Frequency, events/year
  vulnBaseline: Triangular; // Vulnerability before controls, 0..1
  secProb: Triangular; // Secondary Loss Probability, 0..1
  lossPrimary: Triangular; // USD
  lossSecondary: Triangular; // USD
}

export interface SimulationResult {
  trials: number;
  losses: number[]; // sorted ascending
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  lossEventFrequency: number;
}

const MAX_REDUCTION = 0.8; // full coverage across all controls caps vulnerability reduction at 80%

function triangularSample(min: number, mode: number, max: number): number {
  if (max <= min) return min;
  const u = Math.random();
  const fc = (mode - min) / (max - min);
  if (u < fc) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function poissonSample(lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function quantile(sortedArr: number[], q: number): number {
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sortedArr[base + 1] !== undefined
    ? sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base])
    : sortedArr[base];
}

/** Coverage is 0..1 weighted control coverage; reduces the Vulnerability distribution. */
export function reducedVulnerability(vuln: Triangular, coverage: number): Triangular {
  const factor = 1 - coverage * MAX_REDUCTION;
  return {
    min: vuln.min * factor,
    mode: vuln.mode * factor,
    max: Math.max(vuln.max * factor, vuln.min * factor + 1e-6),
  };
}

export function simulate(profile: FairProfile, coverage: number, trials: number): SimulationResult {
  const vuln = reducedVulnerability(profile.vulnBaseline, coverage);
  const losses = new Array<number>(trials);
  let lefSum = 0;

  for (let i = 0; i < trials; i++) {
    const tef = triangularSample(profile.tef.min, profile.tef.mode, profile.tef.max);
    const vu = Math.min(Math.max(triangularSample(vuln.min, vuln.mode, vuln.max), 0), 1);
    const lef = tef * vu;
    lefSum += lef;

    const events = poissonSample(lef);
    let annual = 0;
    for (let e = 0; e < events; e++) {
      const primary = triangularSample(
        profile.lossPrimary.min,
        profile.lossPrimary.mode,
        profile.lossPrimary.max
      );
      const secProb = triangularSample(profile.secProb.min, profile.secProb.mode, profile.secProb.max);
      let secondary = 0;
      if (Math.random() < secProb) {
        secondary = triangularSample(
          profile.lossSecondary.min,
          profile.lossSecondary.mode,
          profile.lossSecondary.max
        );
      }
      annual += primary + secondary;
    }
    losses[i] = annual;
  }

  losses.sort((a, b) => a - b);
  const mean = losses.reduce((s, x) => s + x, 0) / trials;

  return {
    trials,
    losses,
    mean,
    p50: quantile(losses, 0.5),
    p95: quantile(losses, 0.95),
    p99: quantile(losses, 0.99),
    lossEventFrequency: lefSum / trials,
  };
}

/** One-at-a-time sensitivity: swing each factor from its low to high estimate, others held at mode. */
export function sensitivity(profile: FairProfile, coverage: number, trials: number) {
  const rows: { name: string; low: number; high: number }[] = [];

  function withFactor(mutate: (p: FairProfile) => void): number {
    const clone: FairProfile = JSON.parse(JSON.stringify(profile));
    mutate(clone);
    return simulate(clone, coverage, trials).mean;
  }

  rows.push({
    name: "Threat event frequency",
    low: withFactor((p) => {
      p.tef.mode = p.tef.min;
      p.tef.max = p.tef.min;
    }),
    high: withFactor((p) => {
      p.tef.mode = p.tef.max;
      p.tef.min = p.tef.max;
    }),
  });
  rows.push({
    name: "Vulnerability (baseline)",
    low: withFactor((p) => {
      p.vulnBaseline.mode = p.vulnBaseline.min;
      p.vulnBaseline.max = p.vulnBaseline.min;
    }),
    high: withFactor((p) => {
      p.vulnBaseline.mode = p.vulnBaseline.max;
      p.vulnBaseline.min = p.vulnBaseline.max;
    }),
  });
  rows.push({
    name: "Primary loss magnitude",
    low: withFactor((p) => {
      p.lossPrimary.mode = p.lossPrimary.min;
      p.lossPrimary.max = p.lossPrimary.min;
    }),
    high: withFactor((p) => {
      p.lossPrimary.mode = p.lossPrimary.max;
      p.lossPrimary.min = p.lossPrimary.max;
    }),
  });
  rows.push({
    name: "Secondary loss magnitude",
    low: withFactor((p) => {
      p.lossSecondary.mode = p.lossSecondary.min;
      p.lossSecondary.max = p.lossSecondary.min;
    }),
    high: withFactor((p) => {
      p.lossSecondary.mode = p.lossSecondary.max;
      p.lossSecondary.min = p.lossSecondary.max;
    }),
  });
  rows.push({
    name: "Secondary loss probability",
    low: withFactor((p) => {
      p.secProb.mode = p.secProb.min;
      p.secProb.max = p.secProb.min;
    }),
    high: withFactor((p) => {
      p.secProb.mode = p.secProb.max;
      p.secProb.min = p.secProb.max;
    }),
  });

  return rows
    .map((r) => ({ ...r, range: Math.abs(r.high - r.low) }))
    .sort((a, b) => b.range - a.range);
}
