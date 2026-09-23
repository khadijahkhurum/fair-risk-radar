// Translates a FAIR quantitative output (ALE, exceedance probability) into a
// 1-5 qualitative rating — the bridge between the Monte Carlo model and the
// heatmap a risk committee actually reads.
//
// Audit G7: the bands existed only inside these functions, so a user could see
// "Impact 4" with no way to know what dollar range that meant. An ordinal you
// cannot decode is an ordinal you cannot defend or compare across risks, which
// is the exact failure the Methodology page argues FAIR exists to escape.
//
// The bands are now DATA, and the functions are derived from that data. The
// published table and the function that assigns a rating cannot disagree,
// which is the same single-source discipline M1 imposed on the estimator.
//
// The band boundaries themselves remain judgement calls, not a standard, and
// the provenance register says so.

export interface Band {
  rating: number;
  /** Inclusive lower bound. */
  min: number;
  /** Exclusive upper bound; null means unbounded. */
  max: number | null;
}

export const ALE_BANDS: Band[] = [
  { rating: 1, min: 0, max: 100_000 },
  { rating: 2, min: 100_000, max: 1_000_000 },
  { rating: 3, min: 1_000_000, max: 5_000_000 },
  { rating: 4, min: 5_000_000, max: 20_000_000 },
  { rating: 5, min: 20_000_000, max: null },
];

export const PROBABILITY_BANDS: Band[] = [
  { rating: 1, min: 0, max: 0.05 },
  { rating: 2, min: 0.05, max: 0.15 },
  { rating: 3, min: 0.15, max: 0.35 },
  { rating: 4, min: 0.35, max: 0.6 },
  { rating: 5, min: 0.6, max: null },
];

function ratingFrom(bands: Band[], value: number): number {
  for (const band of bands) {
    if (band.max === null || value < band.max) return band.rating;
  }
  return bands[bands.length - 1].rating;
}

/** Impact 1-5 from an annualised loss expectancy, in USD. */
export function ratingFromAle(ale: number): number {
  return ratingFrom(ALE_BANDS, ale);
}

/** Likelihood 1-5 from a probability of exceeding tolerance. */
export function ratingFromProbability(p: number): number {
  return ratingFrom(PROBABILITY_BANDS, p);
}

const compactUsd = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);

/** Human-readable range for a rating, e.g. "$5M – $20M". For publishing the scale. */
export function aleBandLabel(rating: number): string {
  const band = ALE_BANDS.find((b) => b.rating === rating);
  if (!band) return "—";
  if (band.max === null) return `${compactUsd(band.min)} and above`;
  if (band.min === 0) return `under ${compactUsd(band.max)}`;
  return `${compactUsd(band.min)} – ${compactUsd(band.max)}`;
}

/** Human-readable range for a likelihood rating, e.g. "15% – 35%". */
export function probabilityBandLabel(rating: number): string {
  const band = PROBABILITY_BANDS.find((b) => b.rating === rating);
  if (!band) return "—";
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  if (band.max === null) return `${pct(band.min)} and above`;
  if (band.min === 0) return `under ${pct(band.max)}`;
  return `${pct(band.min)} – ${pct(band.max)}`;
}

export function riskScoreLabel(likelihood: number, impact: number): { label: string; className: string } {
  const score = likelihood * impact;
  if (score <= 4) return { label: "Low", className: "bg-emerald-500/70" };
  if (score <= 9) return { label: "Moderate", className: "bg-amber-500/70" };
  if (score <= 16) return { label: "High", className: "bg-orange-500/70" };
  return { label: "Critical", className: "bg-risk/80" };
}
