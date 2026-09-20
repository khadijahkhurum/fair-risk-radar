"use client";

// The classic 5x5 likelihood/impact heatmap. Built with plain CSS grid —
// a proper matrix/heatmap chart type isn't part of Chart.js core and would
// mean a new dependency (chartjs-chart-matrix) for something 25 colored
// divs handle natively.
// Full class strings, not built by concatenation — Tailwind's content scanner
// only picks up classes that appear literally in source, so constructing
// "bg-emerald-500" + "/30" at runtime would silently fail to generate the
// opacity variant.
function bandForScore(score: number): string {
  if (score <= 4) return "bg-emerald-500/30";
  if (score <= 9) return "bg-amber-500/30";
  if (score <= 16) return "bg-orange-500/30";
  return "bg-risk/30";
}

export interface HeatmapPoint {
  id: string;
  title: string;
  likelihood: number; // 1-5
  impact: number; // 1-5
}

export function RiskHeatmap({ title, points }: { title: string; points: HeatmapPoint[] }) {
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
              return (
                <div
                  key={`${likelihood}-${impact}`}
                  className={`h-16 rounded-md ${bandForScore(likelihood * impact)} border border-border flex flex-wrap items-center justify-center gap-1 p-1`}
                  title={cellPoints.map((p) => p.title).join(", ")}
                >
                  {cellPoints.map((p) => (
                    <span
                      key={p.id}
                      className="w-2.5 h-2.5 rounded-full bg-slate-100 border border-slate-900"
                      title={p.title}
                    />
                  ))}
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
    </div>
  );
}
