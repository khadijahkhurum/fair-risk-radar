"use client";

// The classic 5x5 likelihood/impact heatmap. Built with plain CSS grid —
// a proper matrix/heatmap chart type isn't part of Chart.js core and would
// mean a new dependency (chartjs-chart-matrix) for something 25 colored
// divs handle natively.
// Full class strings, not built by concatenation — Tailwind's content scanner
// only picks up classes that appear literally in source, so constructing
// "bg-emerald-500" + "/30" at runtime would silently fail to generate the
// opacity variant.
//
// Audit A2 / WCAG 2.2 1.4.1: the band was conveyed by cell colour alone, and
// the legend keyed colour to a word. `min` exists so the legend can state the
// SCORE RANGE for each band — with the score already printed in every cell,
// band membership is then readable without perceiving colour at all.
const BANDS = [
  { min: 1, max: 4, label: "Low", cell: "bg-emerald-500/30", dot: "bg-emerald-400" },
  { min: 5, max: 9, label: "Moderate", cell: "bg-amber-500/30", dot: "bg-amber-400" },
  { min: 10, max: 16, label: "High", cell: "bg-orange-500/30", dot: "bg-orange-400" },
  { min: 17, max: 25, label: "Critical", cell: "bg-risk/30", dot: "bg-risk" },
] as const;

function bandForScore(score: number) {
  return BANDS.find((b) => score <= b.max) ?? BANDS[BANDS.length - 1];
}

export interface HeatmapPoint {
  id: string;
  title: string;
  likelihood: number; // 1-5
  impact: number; // 1-5
}

export function RiskHeatmap({
  title,
  points,
  selectedId,
  onSelectPoint,
}: {
  title: string;
  points: HeatmapPoint[];
  selectedId?: string | null;
  onSelectPoint?: (id: string | null) => void;
}) {
  const byCell = new Map<string, HeatmapPoint[]>();
  for (const p of points) {
    const key = `${p.likelihood}-${p.impact}`;
    byCell.set(key, [...(byCell.get(key) ?? []), p]);
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-slate-300 mb-2">{title}</h4>
      <p className="sr-only">
        A five-by-five grid of likelihood against impact. Each cell shows its risk score, likelihood multiplied by
        impact, from 1 to 25. Bands by score: Low 1 to 4, Moderate 5 to 9, High 10 to 16, Critical 17 to 25.
        {points.length === 0
          ? " No risks are plotted."
          : ` ${points.length} risk${points.length === 1 ? " is" : "s are"} plotted: ${points
              .map(
                (p) =>
                  `${p.title}, likelihood ${p.likelihood}, impact ${p.impact}, score ${p.likelihood * p.impact} (${
                    bandForScore(p.likelihood * p.impact).label
                  })`
              )
              .join("; ")}.`}
      </p>
      <div className="flex gap-2">
        <div aria-hidden="true" className="flex flex-col justify-between text-[10px] text-slate-500 py-1">
          {[5, 4, 3, 2, 1].map((n) => (
            <span key={n} className="h-16 flex items-center">
              {n}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-5 grid-rows-5 gap-1 flex-1">
          {[5, 4, 3, 2, 1].map((impact) =>
            [1, 2, 3, 4, 5].map((likelihood) => {
              const cellPoints = byCell.get(`${likelihood}-${impact}`) ?? [];
              const band = bandForScore(likelihood * impact);
              return (
                <div
                  key={`${likelihood}-${impact}`}
                  className={`relative h-16 rounded-md ${band.cell} border border-border flex flex-wrap items-center justify-center gap-1 p-1 transition-colors hover:brightness-125`}
                >
                  <span className="absolute top-0.5 left-1 text-[9px] text-slate-500 tabular-nums select-none">
                    {likelihood * impact}
                  </span>
                  {cellPoints.map((p) => {
                    const isSelected = p.id === selectedId;
                    return (
                      // Audit A3 / WCAG 2.2 2.5.8 (Target Size): the dot itself
                      // used to be the button, at 12x12. The dot stays 12px for
                      // density; the BUTTON is a full 24x24 around it, with no
                      // negative margin, so adjacent targets never overlap.
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPoint?.(isSelected ? null : p.id)}
                        title={p.title}
                        aria-pressed={isSelected}
                        aria-label={`${p.title} — likelihood ${p.likelihood} of 5, impact ${p.impact} of 5, score ${
                          p.likelihood * p.impact
                        }, ${band.label} band`}
                        className="group w-6 h-6 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent2"
                      >
                        <span
                          aria-hidden="true"
                          className={`w-3 h-3 rounded-full border transition-transform ${
                            isSelected
                              ? "bg-white border-accent2 ring-2 ring-accent2 scale-125"
                              : `${band.dot} border-slate-900/40 group-hover:scale-125`
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 pl-5">
        <span>Likelihood 1</span>
        <span>Likelihood 5</span>
      </div>
      <div className="flex items-center gap-3 mt-3 pl-5 flex-wrap">
        {BANDS.map((b) => (
          <span key={b.label} className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-sm ${b.dot}`} />
            {b.label} ({b.min}&ndash;{b.max})
          </span>
        ))}
      </div>
    </div>
  );
}
