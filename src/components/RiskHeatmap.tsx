"use client";

// The classic 5x5 likelihood/impact heatmap. Built with plain CSS grid —
// a proper matrix/heatmap chart type isn't part of Chart.js core and would
// mean a new dependency (chartjs-chart-matrix) for something 25 colored
// divs handle natively.
// Full class strings, not built by concatenation — Tailwind's content scanner
// only picks up classes that appear literally in source, so constructing
// "bg-emerald-500" + "/30" at runtime would silently fail to generate the
// opacity variant.
const BANDS = [
  { max: 4, label: "Low", cell: "bg-emerald-500/30", dot: "bg-emerald-400" },
  { max: 9, label: "Moderate", cell: "bg-amber-500/30", dot: "bg-amber-400" },
  { max: 16, label: "High", cell: "bg-orange-500/30", dot: "bg-orange-400" },
  { max: 25, label: "Critical", cell: "bg-risk/30", dot: "bg-risk" },
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
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-slate-500 py-1">
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
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPoint?.(isSelected ? null : p.id)}
                        title={p.title}
                        className={`w-3 h-3 rounded-full border transition-transform ${
                          isSelected
                            ? "bg-white border-accent2 ring-2 ring-accent2 scale-125"
                            : `${band.dot} border-slate-900/40 hover:scale-125`
                        }`}
                      />
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
            <span className={`w-2.5 h-2.5 rounded-sm ${b.dot}`} />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
