"use client";

// Thin wrapper around raw Chart.js (already a dependency — no react-chartjs-2
// needed for one reusable component). Registers the controllers/elements
// once, then creates/updates/destroys a Chart instance tied to this canvas.
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

// Typed loosely (TType=any) on purpose: Chart.js's per-chart-type generics
// make a shared config prop unwieldy across bar/line callers, and this
// component doesn't touch the data shape — it just mounts whatever
// configuration its caller already built correctly.
export function ChartCanvas({ config }: { config: ChartConfiguration<any> }) {
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

  return <canvas ref={canvasRef} />;
}
