"use client";

// Thin wrapper around raw Chart.js (already a dependency — no react-chartjs-2
// needed for one reusable component). Registers the controllers/elements
// once, then creates/updates/destroys a Chart instance tied to this canvas.
//
// Audit A1: every chart in the product was a bare <canvas> with no
// aria-label, no role, no fallback content and no data table. A screen-reader
// user got NOTHING from the loss distribution, the exceedance curve, the ROI
// net-benefit chart, the transfer curves or the risk heatmaps. WCAG 2.2 1.1.1
// (Non-text Content) and 4.1.2 (Name, Role, Value).
//
// The text alternative is rendered sr-only rather than in a <details> so it
// costs zero layout — Chart.js sizes itself from its parent, and adding a
// visible disclosure inside the chart container would fight that.
import { useEffect, useRef } from "react";
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

export interface ChartTable {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}

/**
 * What a caller memoizes and spreads onto <ChartCanvas>. Bundling the text
 * alternative with the configuration is deliberate: they are derived from the
 * same data in the same memo, so they cannot drift apart the way a separately
 * maintained aria-label would.
 */
export interface ChartSpec {
  config: ChartConfiguration<any>;
  /**
   * One sentence stating what the chart shows AND its headline values — this
   * becomes the accessible name. "Loss exceedance curve" alone is useless;
   * "50% of simulated years exceed $6.6M, 10% exceed $16.5M" is the content.
   */
  summary?: string;
  /** The same data, semantically, for anyone who cannot see the canvas. */
  table?: ChartTable;
}

// Typed loosely (TType=any) on purpose: Chart.js's per-chart-type generics
// make a shared config prop unwieldy across bar/line callers, and this
// component doesn't touch the data shape — it just mounts whatever
// configuration its caller already built correctly.
export function ChartCanvas({ config, summary, table }: ChartSpec) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // Re-create whenever the config object identity changes — callers
    // memoize/derive a fresh config from their data deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  return (
    <figure className="m-0 h-full">
      <canvas ref={canvasRef} role="img" aria-label={summary ?? "Chart"} />
      {summary && <figcaption className="sr-only">{summary}</figcaption>}
      {table && (
        <table className="sr-only">
          <caption>{table.caption}</caption>
          <thead>
            <tr>
              {table.head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={j}>{cell}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
