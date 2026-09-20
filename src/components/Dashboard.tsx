"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { ChartCanvas } from "./ChartCanvas";
import { MultiSelectDropdown } from "./MultiSelectDropdown";

interface Scenario {
  id: string;
  name: string;
  industry: string;
  tefLambda: number;
  vulnerability: number;
  lossMin: number;
  lossMode: number;
  lossMax: number;
  sourceNote: string;
}
interface Threat {
  id: string;
  name: string;
  description: string;
  tefMultiplier: number;
  vulnerabilityMultiplier: number;
}
interface HistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
}
interface LecPoint {
  loss: number;
  probability: number;
}
interface FairResult {
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
interface HistoryItem {
  id: string;
  meanAle: number;
  createdAt: string;
}
interface Run {
  id: string;
  label: string;
  color: string;
  result: FairResult;
  threatIds: string[];
  avgControlCoveragePct: number;
}

const RUN_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981"];
const MAX_RUNS = RUN_COLORS.length;
const DEFAULT_TOLERANCE_MAX = 20_000_000;
// Same 10% bar the stat card's red/green accent already uses — kept as one
// constant so the "required tolerance" readout and the what-if panel agree.
const TARGET_EXCEED_PROBABILITY = 0.1;

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
const currencyFull = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

// Risk-tolerance traffic light: a threshold under $300K reads as a
// conservative/low risk appetite, up to $2M as moderate, above as high.
// Bands are arbitrary judgment calls, not a standard — adjust to taste.
const TOLERANCE_LOW_MAX = 300_000;
const TOLERANCE_MODERATE_MAX = 2_000_000;
type ToleranceBand = "none" | "low" | "moderate" | "high";
function bandForTolerance(value: number | null): ToleranceBand {
  if (value === null) return "none";
  if (value < TOLERANCE_LOW_MAX) return "low";
  if (value < TOLERANCE_MODERATE_MAX) return "moderate";
  return "high";
}
const TOLERANCE_BAND_LABEL: Record<ToleranceBand, string> = {
  none: "",
  low: "Low risk appetite",
  moderate: "Moderate risk appetite",
  high: "High risk appetite",
};
const TOLERANCE_BAND_TEXT: Record<ToleranceBand, string> = {
  none: "",
  low: "text-emerald-400",
  moderate: "text-amber-400",
  high: "text-risk",
};
const TOLERANCE_BAND_BORDER: Record<ToleranceBand, string> = {
  none: "border-border",
  low: "border-emerald-500/60",
  moderate: "border-amber-500/60",
  high: "border-risk/60",
};

const GRID_COLOR = "rgba(148, 163, 184, 0.08)";
const TICK_COLOR = "rgba(148, 163, 184, 0.65)";

// Linear interpolation within an already-computed Loss Exceedance Curve, so
// dragging the risk-tolerance slider updates the displayed probability
// instantly without re-running the 8,000-trial simulation.
function interpolateLec(lec: LecPoint[], x: number): number | null {
  if (lec.length === 0) return null;
  if (x <= lec[0].loss) return lec[0].probability;
  const last = lec[lec.length - 1];
  if (x >= last.loss) return last.probability;
  for (let i = 0; i < lec.length - 1; i++) {
    const a = lec[i];
    const b = lec[i + 1];
    if (x >= a.loss && x <= b.loss) {
      const t = (x - a.loss) / (b.loss - a.loss);
      return a.probability + t * (b.probability - a.probability);
    }
  }
  return null;
}

// Inverse of interpolateLec: the lowest loss threshold at which exceedance
// probability drops to (or below) the target — i.e. "what tolerance would
// already be green here." Returns null if even the largest simulated loss
// still exceeds the target (would need a materially different risk posture,
// not just a bigger tolerance number).
function toleranceForTargetProbability(lec: LecPoint[], target: number): number | null {
  for (const point of lec) {
    if (point.probability <= target) return point.loss;
  }
  return null;
}

export function Dashboard() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [scenarioId, setScenarioId] = useState("");
  const [threatIds, setThreatIds] = useState<string[]>([]);
  const [riskTolerance, setRiskTolerance] = useState<string>("");

  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [histogramDetail, setHistogramDetail] = useState<string | null>(null);
  const [lecDetail, setLecDetail] = useState<string | null>(null);

  // "What would make this green?" experiment panel — a hypothetical control
  // coverage % and threat set, re-simulated live (not persisted, doesn't
  // touch the real control posture or audit trail).
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [whatIfCoverage, setWhatIfCoverage] = useState(0);
  const [whatIfThreatIds, setWhatIfThreatIds] = useState<string[]>([]);
  const [whatIfResult, setWhatIfResult] = useState<FairResult | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  // Per-threat marginal impact: for each currently-included threat, "what
  // would P(loss > tolerance) be if only this one threat were dropped" —
  // lets someone see which single threat is worth mitigating first, without
  // manually unticking each checkbox one at a time.
  const [perThreatWithoutResult, setPerThreatWithoutResult] = useState<Record<string, number | null>>({});
  const whatIfRequestId = useRef(0);
  // "Ceiling check" — best case the model allows (100% coverage, zero added
  // threats). If even this can't reach green, no amount of slider-dragging
  // will either, so tell the user that up front instead of making them find
  // it by trial and error.
  const [bestCaseFloor, setBestCaseFloor] = useState<number | null>(null);

  async function loadScenarios() {
    try {
      const res = await fetch("/api/scenarios");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setScenarios(data.scenarios);
      setThreats(data.threats);
      if (data.scenarios[0]) {
        setScenarioId((prev) => prev || data.scenarios[0].id);
        setRiskTolerance((prev) => prev || String(Math.round(data.scenarios[0].lossMode)));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load dashboard data");
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/risk");
      const data = await res.json();
      if (res.ok) setHistory(data.history);
    } catch {
      // history is a nice-to-have trend chart — a failed load shouldn't block the rest of the dashboard
    }
  }

  useEffect(() => {
    loadScenarios();
    loadHistory();
  }, []);

  async function runSimulation() {
    if (!scenarioId) return;
    setRunning(true);
    setLoadError(null);
    setHistogramDetail(null);
    setLecDetail(null);
    try {
      const res = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          threatIds,
          riskTolerance: riskTolerance ? Number(riskTolerance) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Simulation failed");

      const scenarioName = scenarios.find((s) => s.id === scenarioId)?.name ?? scenarioId;
      const threatLabel = threatIds.length === 0 ? "Baseline" : `${threatIds.length} threat${threatIds.length > 1 ? "s" : ""}`;
      const run: Run = {
        id: data.assessment.id,
        label: `${scenarioName} — ${threatLabel}`,
        color: RUN_COLORS[0],
        result: data.result,
        threatIds,
        avgControlCoveragePct: data.assessment.avgControlCoveragePct,
      };
      setRuns((prev) =>
        [run, ...prev].slice(0, MAX_RUNS).map((r, i) => ({ ...r, color: RUN_COLORS[i] }))
      );
      loadHistory();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  }

  const selectedScenario = scenarios.find((s) => s.id === scenarioId);
  const toleranceValue = riskTolerance ? Number(riskTolerance) : null;
  const toleranceBand = bandForTolerance(toleranceValue);
  const latestRun = runs[0] ?? null;

  const toleranceSliderMax = latestRun
    ? latestRun.result.histogram[latestRun.result.histogram.length - 1].rangeEnd
    : DEFAULT_TOLERANCE_MAX;

  const liveExceedProbability = useMemo(() => {
    if (!latestRun || toleranceValue === null) return null;
    return interpolateLec(latestRun.result.lec, toleranceValue);
  }, [latestRun, toleranceValue]);

  const requiredToleranceForGreen = useMemo(() => {
    if (!latestRun) return null;
    return toleranceForTargetProbability(latestRun.result.lec, TARGET_EXCEED_PROBABILITY);
  }, [latestRun]);

  // Seed the what-if panel from the real latest run whenever it changes,
  // so opening it starts from "what you actually have" rather than zero.
  useEffect(() => {
    if (!latestRun) return;
    setWhatIfCoverage(Math.round(latestRun.avgControlCoveragePct));
    setWhatIfThreatIds(latestRun.threatIds);
  }, [latestRun]);

  // Debounced live re-simulation as the user drags the coverage slider or
  // toggles threats — a real 4,000-trial run per change, so it waits for a
  // pause rather than firing on every pixel of drag.
  useEffect(() => {
    if (!whatIfOpen || !scenarioId || toleranceValue === null) return;
    setWhatIfLoading(true);
    const handle = setTimeout(async () => {
      const requestId = ++whatIfRequestId.current;
      const runWhatIf = async (ids: string[]) => {
        try {
          const res = await fetch("/api/risk/whatif", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scenarioId,
              threatIds: ids,
              riskTolerance: toleranceValue,
              coveragePct: whatIfCoverage,
            }),
          });
          const data = await res.json();
          return res.ok ? (data.result as FairResult) : null;
        } catch {
          return null;
        }
      };

      const main = await runWhatIf(whatIfThreatIds);
      if (requestId !== whatIfRequestId.current) return; // a newer drag superseded this one
      setWhatIfResult(main);

      // One extra simulation per currently-included threat, run in parallel,
      // each with that single threat dropped and everything else held fixed.
      const perThreat = await Promise.all(
        whatIfThreatIds.map(async (id) => {
          const without = await runWhatIf(whatIfThreatIds.filter((t) => t !== id));
          return [id, without?.pExceedTolerance ?? null] as const;
        })
      );
      if (requestId === whatIfRequestId.current) {
        setPerThreatWithoutResult(Object.fromEntries(perThreat));
        setWhatIfLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [whatIfOpen, scenarioId, whatIfThreatIds, whatIfCoverage, toleranceValue]);

  // Computed once per scenario/tolerance (not on every drag) — the absolute
  // best case, independent of whatever the sliders currently say.
  useEffect(() => {
    if (!whatIfOpen || !scenarioId || toleranceValue === null) {
      setBestCaseFloor(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/risk/whatif", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId, threatIds: [], riskTolerance: toleranceValue, coveragePct: 100 }),
        });
        const data = await res.json();
        if (!cancelled && res.ok) setBestCaseFloor(data.result.pExceedTolerance);
      } catch {
        // ceiling check is a nice-to-have hint, not load-bearing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [whatIfOpen, scenarioId, toleranceValue]);

  const whatIfExceedProbability = whatIfResult?.pExceedTolerance ?? null;
  const whatIfIsGreen = whatIfExceedProbability !== null && whatIfExceedProbability <= TARGET_EXCEED_PROBABILITY;

  const histogramConfig = useMemo<ChartConfiguration<any> | null>(() => {
    if (!latestRun) return null;
    const { histogram } = latestRun.result;
    const toleranceIdx =
      toleranceValue !== null ? histogram.findIndex((b) => toleranceValue < b.rangeEnd) : -1;
    return {
      type: "bar",
      data: {
        labels: histogram.map((b) => currency(b.rangeStart)),
        datasets: [
          {
            label: "Simulated years",
            data: histogram.map((b) => b.count),
            backgroundColor: histogram.map((_, i) => (toleranceIdx >= 0 && i >= toleranceIdx ? "#f43f5e" : "#6366f1")),
            borderRadius: 3,
            barPercentage: 1,
            categoryPercentage: 0.95,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt: any, elements: any[]) => {
          if (elements.length === 0) return;
          const b = histogram[elements[0].index];
          const pct = ((b.count / latestRun.result.trials) * 100).toFixed(1);
          setHistogramDetail(
            `${currency(b.rangeStart)}–${currency(b.rangeEnd)}: ${b.count} of ${latestRun.result.trials} simulated years (${pct}%)`
          );
        },
        interaction: { mode: "nearest", intersect: false, axis: "x" },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: TICK_COLOR, maxTicksLimit: 8, autoSkip: true }, grid: { display: false } },
          y: { ticks: { color: TICK_COLOR }, grid: { color: GRID_COLOR } },
        },
      },
    };
  }, [latestRun, toleranceValue]);

  const lecConfig = useMemo<ChartConfiguration<any> | null>(() => {
    if (runs.length === 0) return null;
    return {
      type: "line",
      data: {
        datasets: runs.map((run) => ({
          label: run.label,
          data: run.result.lec.map((p) => ({ x: p.loss, y: p.probability })),
          borderColor: run.color,
          backgroundColor: run.color + "1f",
          fill: runs.length === 1,
          tension: 0.25,
          pointRadius: 0,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_evt: any, elements: any[]) => {
          if (elements.length === 0) return;
          const el = elements[0];
          const run = runs[el.datasetIndex];
          const point = run.result.lec[el.index];
          setLecDetail(
            `${run.label} — at ${currency(point.loss)}: ${(point.probability * 100).toFixed(1)}% probability of exceeding`
          );
        },
        interaction: { mode: "nearest", intersect: false, axis: "x" },
        plugins: {
          legend: { display: runs.length > 1, labels: { color: TICK_COLOR, boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ${(ctx.parsed.y * 100).toFixed(1)}% at ${currency(ctx.parsed.x)}`,
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            ticks: { color: TICK_COLOR, callback: (v: any) => currency(Number(v)) },
            grid: { display: false },
          },
          y: {
            ticks: { color: TICK_COLOR, callback: (v: any) => `${(Number(v) * 100).toFixed(0)}%` },
            grid: { color: GRID_COLOR },
          },
        },
      },
    };
  }, [runs]);

  const trendConfig = useMemo<ChartConfiguration<any> | null>(() => {
    if (history.length === 0) return null;
    const ordered = [...history].reverse();
    return {
      type: "line",
      data: {
        labels: ordered.map((h) =>
          new Date(h.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        ),
        datasets: [
          {
            label: "Mean ALE",
            data: ordered.map((h) => h.meanAle),
            borderColor: "#6366f1",
            backgroundColor: "rgba(99, 102, 241, 0.12)",
            fill: true,
            tension: 0.25,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => currencyFull(ctx.raw as number) } },
        },
        scales: {
          x: { ticks: { color: TICK_COLOR }, grid: { display: false } },
          y: { ticks: { color: TICK_COLOR, callback: (v: any) => currency(Number(v)) }, grid: { color: GRID_COLOR } },
        },
      },
    };
  }, [history]);

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Risk Dashboard</h1>
        <p className="text-slate-400 mt-1">
          Monte Carlo FAIR simulation across industry, threat, and control posture — not a slider demo.
        </p>
      </header>

      {loadError && (
        <div className="mb-6 rounded-lg border border-risk/30 bg-risk/10 text-risk px-4 py-3 text-sm">{loadError}</div>
      )}

      <div className="rounded-xl border border-border bg-surface p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Industry Scenario</span>
            <select className="select" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <MultiSelectDropdown
            label="Threat Types (select any number)"
            placeholder="Baseline (no threat modifier)"
            options={threats.map((t) => ({ id: t.id, label: t.name, description: t.description }))}
            selected={threatIds}
            onChange={setThreatIds}
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">
                Risk Tolerance (annual, USD) — drag or type
              </span>
              <span className={`text-[11px] font-medium ${TOLERANCE_BAND_TEXT[toleranceBand]}`}>
                {TOLERANCE_BAND_LABEL[toleranceBand]}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={toleranceSliderMax}
              step={Math.max(1, Math.round(toleranceSliderMax / 500))}
              value={toleranceValue ?? 0}
              onChange={(e) => setRiskTolerance(e.target.value)}
              className="w-full accent-accent"
            />
            <input
              type="number"
              min={0}
              value={riskTolerance}
              onChange={(e) => setRiskTolerance(e.target.value)}
              placeholder="e.g. 5000000"
              className={`select border-2 ${TOLERANCE_BAND_BORDER[toleranceBand]}`}
            />
          </div>
        </div>
        {selectedScenario && <p className="text-xs text-slate-500 mb-4">{selectedScenario.sourceNote}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={runSimulation}
            disabled={running || !scenarioId}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-accent to-accent2 text-white font-medium text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {running ? "Running 8,000 trials…" : "Run Simulation"}
          </button>
          {runs.length > 0 && (
            <button
              onClick={() => {
                setRuns([]);
                setHistogramDetail(null);
                setLecDetail(null);
              }}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              Clear comparison ({runs.length})
            </button>
          )}
        </div>
      </div>

      {latestRun && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Mean ALE" value={currencyFull(latestRun.result.meanAle)} />
            <StatCard label="P50 ALE" value={currencyFull(latestRun.result.p50Ale)} />
            <StatCard label="P90 ALE" value={currencyFull(latestRun.result.p90Ale)} />
            <StatCard
              label="P(loss > tolerance)"
              value={liveExceedProbability !== null ? `${(liveExceedProbability * 100).toFixed(1)}%` : "—"}
              accent={
                liveExceedProbability === null
                  ? undefined
                  : liveExceedProbability > TARGET_EXCEED_PROBABILITY
                  ? "risk"
                  : "safe"
              }
            />
          </div>

          {liveExceedProbability !== null && liveExceedProbability > TARGET_EXCEED_PROBABILITY && (
            <p className="text-xs text-slate-400 -mt-3 mb-6">
              {requiredToleranceForGreen !== null ? (
                <>
                  At today's threats and control coverage, tolerance would need to be{" "}
                  <span className="text-emerald-400 font-medium">{currencyFull(requiredToleranceForGreen)}</span> or
                  higher to go green.{" "}
                </>
              ) : (
                <>Raising the tolerance alone won't turn this green within the simulated range — </>
              )}
              <button onClick={() => setWhatIfOpen((v) => !v)} className="text-accent2 underline hover:no-underline">
                try lowering risk instead
              </button>
              .
            </p>
          )}

          <div className="rounded-xl border border-border bg-surface p-5 mb-6">
            <button
              onClick={() => setWhatIfOpen((v) => !v)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="font-semibold text-slate-100">
                Experiment: what would make this green?
              </span>
              <span className="text-xs text-slate-400">{whatIfOpen ? "Hide ▲" : "Show ▼"}</span>
            </button>
            {whatIfOpen && bestCaseFloor !== null && (
              <div className="mt-3 border-t border-border pt-3">
                {bestCaseFloor > TARGET_EXCEED_PROBABILITY ? (
                  <p className="text-xs text-amber-400">
                    Ceiling check: even at 100% control coverage with no threats added, this scenario still exceeds
                    tolerance {(bestCaseFloor * 100).toFixed(1)}% of the time. Green isn't reachable at{" "}
                    {currencyFull(toleranceValue ?? 0)} through controls alone — raise the tolerance above, or treat
                    this as a case for risk transfer (insurance) rather than more controls.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">
                    Ceiling check: at 100% control coverage with no threats added, this scenario drops to{" "}
                    <span className="text-emerald-400 font-medium">{(bestCaseFloor * 100).toFixed(1)}%</span> — green
                    is reachable here.{" "}
                    <button
                      onClick={() => {
                        setWhatIfCoverage(100);
                        setWhatIfThreatIds([]);
                      }}
                      className="text-accent2 underline hover:no-underline"
                    >
                      Jump to that combination
                    </button>
                    .
                  </p>
                )}
              </div>
            )}
            {whatIfOpen && (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-400">
                      Hypothetical control coverage: {whatIfCoverage}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={whatIfCoverage}
                      onChange={(e) => setWhatIfCoverage(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-400">
                      Threats included — toggle one off, or read "without it" to see its weight
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {threats.map((t) => {
                        const included = whatIfThreatIds.includes(t.id);
                        const withoutIt = perThreatWithoutResult[t.id];
                        const withoutItGreen = withoutIt !== null && withoutIt !== undefined && withoutIt <= TARGET_EXCEED_PROBABILITY;
                        return (
                          <label key={t.id} className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={(e) =>
                                setWhatIfThreatIds((prev) =>
                                  e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                                )
                              }
                            />
                            <span className="flex-1">{t.name}</span>
                            {included && withoutIt !== null && withoutIt !== undefined && (
                              <span className={`text-[11px] ${withoutItGreen ? "text-emerald-400 font-medium" : "text-slate-500"}`}>
                                without it: {(withoutIt * 100).toFixed(1)}%{withoutItGreen ? " ✓" : ""}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div
                  className={`rounded-lg border p-4 flex flex-col justify-center ${
                    whatIfIsGreen ? "border-emerald-500/60 bg-emerald-500/10" : "border-risk/40 bg-risk/5"
                  }`}
                >
                  <div className="text-xs text-slate-400 mb-1">
                    P(loss &gt; tolerance) at these settings{whatIfLoading ? " (recalculating…)" : ""}
                  </div>
                  <div className={`text-2xl font-semibold tabular-nums ${whatIfIsGreen ? "text-emerald-400" : "text-risk"}`}>
                    {whatIfExceedProbability !== null ? `${(whatIfExceedProbability * 100).toFixed(1)}%` : "—"}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {whatIfIsGreen
                      ? `At ${whatIfCoverage}% control coverage with ${whatIfThreatIds.length} threat${
                          whatIfThreatIds.length === 1 ? "" : "s"
                        } in scope, this drops under the ${(TARGET_EXCEED_PROBABILITY * 100).toFixed(0)}% bar — that's the combination to take to the board as the mitigation plan.`
                      : `vs. ${liveExceedProbability !== null ? `${(liveExceedProbability * 100).toFixed(1)}%` : "—"} today. Drag coverage up or drop a threat to see what it takes to go green.`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Simulated Annual Loss Distribution" detail={histogramDetail} hint="Click a bar for detail">
              {histogramConfig && <ChartCanvas config={histogramConfig} />}
            </ChartCard>
            <ChartCard
              title={runs.length > 1 ? "Loss Exceedance Curve — comparing runs" : "Loss Exceedance Curve"}
              detail={lecDetail}
              hint="Click the curve for detail · run again to compare"
            >
              {lecConfig && <ChartCanvas config={lecConfig} />}
            </ChartCard>
          </div>
        </>
      )}

      {trendConfig && (
        <ChartCard title="Mean ALE Over Time (Audit Trail)">
          <ChartCanvas config={trendConfig} />
        </ChartCard>
      )}
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "risk" | "safe" }) {
  const color = accent === "risk" ? "text-risk" : accent === "safe" ? "text-emerald-400" : "text-slate-100";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  detail,
  hint,
}: {
  title: string;
  children: React.ReactNode;
  detail?: string | null;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold text-slate-100">{title}</h3>
        {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
      </div>
      <div className="h-64 mb-2">{children}</div>
      {detail && <p className="text-xs text-accent2 border-t border-border pt-2">{detail}</p>}
    </div>
  );
}
