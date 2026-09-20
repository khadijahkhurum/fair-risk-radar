// Translates a FAIR quantitative output (ALE, exceedance probability) into
// a 1-5 qualitative rating — the bridge between the Monte Carlo model and
// the heatmap a risk committee actually reads. Bands are judgment calls,
// not a standard; always presented as a suggestion the user can override.
export function ratingFromAle(ale: number): number {
  if (ale < 100_000) return 1;
  if (ale < 1_000_000) return 2;
  if (ale < 5_000_000) return 3;
  if (ale < 20_000_000) return 4;
  return 5;
}

export function ratingFromProbability(p: number): number {
  if (p < 0.05) return 1;
  if (p < 0.15) return 2;
  if (p < 0.35) return 3;
  if (p < 0.6) return 4;
  return 5;
}

export function riskScoreLabel(likelihood: number, impact: number): { label: string; className: string } {
  const score = likelihood * impact;
  if (score <= 4) return { label: "Low", className: "bg-emerald-500/70" };
  if (score <= 9) return { label: "Moderate", className: "bg-amber-500/70" };
  if (score <= 16) return { label: "High", className: "bg-orange-500/70" };
  return { label: "Critical", className: "bg-risk/80" };
}
