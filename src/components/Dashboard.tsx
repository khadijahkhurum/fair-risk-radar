"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { ChartCanvas, type ChartSpec } from "./ChartCanvas";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { SelectDropdown } from "./SelectDropdown";
import { StatusBadge } from "./StatusBadge";
import { AssessmentGovernance, type Viewer } from "./AssessmentGovernance";
import {
  exceedanceProbability,
  formatPercent,
  formatPercentWithError,
  standardErrorOfProportion,
  separated,
  // E3: one definition of the green threshold, shared with the engine.
  GREEN_THRESHOLD as TARGET_EXCEED_PROBABILITY,
} from "@/lib/stats";
import { DEFAULT_TRIALS } from "@/lib/fair";
import { toleranceSliderDomain } from "@/lib/slider-domain";

interface Scenario {
  id: string;
  name: string;
  industry: string;
  tefLambda: number;
  vulnerability: number;
  primaryLossMode: number;
  secondaryLossProbability: number;
  secondaryLossMode: number;
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
  seed: string;
  engineVersion: string;
  meanAle: number;
  p10Ale: number;
  p50Ale: number;
  p90Ale: number;
  adjustedTefLambda: number;
  adjustedVulnerability: number;
  histogram: HistogramBucket[];
  lec: LecPoint[];
  /** Present on a persisted run; omitted from the high-frequency what-if endpoint. */
  sortedLosses?: number[];
  pExceedTolerance: number | null;
  toleranceForGreen: number;
  seMeanAle: number;
  sePExceedTolerance: number | null;
}
interface HistoryItem {
  id: string;
  meanAle: number;
  createdAt: string;
  // Model governance (audit G4). These travel with every persisted row so the
  // page can say what produced a figure and whether it still can.
  status: "DRAFT" | "APPROVED";
  seed: string;
  trials: number;
  engineVersion: string;
  parameterSetVersion: string;
  parameterSetHash: string;
  reproducible: boolean;
  runBy: { email: string } | null;
  approvedBy: { email: string } | null;
  approvedAt: string | null;
  approvalNote: string | null;
}
interface Run {
  id: string;
  label: string;
  color: string;
  result: FairResult;
  threatIds: string[];
  avgControlCoveragePct: number;
}

const RUN_COLORS = ["#0a84ff", "#64d2ff", "#ff9f0a", "#30d158"];
const MAX_RUNS = RUN_COLORS.length;
const DEFAULT_TOLERANCE_MAX = 20_000_000;
// Upper bound on a typed/pasted tolerance — blocks garbage like a pasted
// 20-digit number from ever reaching state, let alone the simulation.
const MAX_TOLERANCE = 1_000_000_000_000; // $1T/year — already absurd for any scenario here
// The slider's own step size before a real run exists (matches the range
// input's step formula below at max=DEFAULT_TOLERANCE_MAX) — used to round
// the seeded tolerance onto a value the slider can actually represent, so
// the number box and slider thumb agree from the very first paint instead
// of the browser silently snapping the thumb to a different number.
// E3: was Math.max(1, Math.round(DEFAULT_TOLERANCE_MAX / 500)) — a rounding of
// a value already integral. Derived from the one place that defines a step,
// so the seeded tolerance always lands exactly on a slider position.
const DEFAULT_TOLERANCE_STEP = toleranceSliderDomain(null, DEFAULT_TOLERANCE_MAX).step;
// Same 10% bar the stat card's red/green accent already uses — kept as one
// constant so the "required tolerance" readout and the what-if panel agree.

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
const currencyFull = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

// Risk-appetite label, expressed RELATIVE to the modelled mean ALE (audit M9).
//
// This used to be fixed dollar bands: under $300K "low", under $2M "moderate",
// above "high" — regardless of scenario, sector or balance sheet. For a bank
// with a modelled mean ALE of $7.4M, a $2M annual tolerance was labelled
// "High risk appetite" when it is in fact extremely conservative. The label
// did not merely lack context; it said the opposite of the truth.
//
// Risk appetite is an organisational statement, not an absolute dollar amount.
// The Methodology page already says exactly this about the 10% bar. The same
// reasoning applies here: what matters is the tolerance against the loss the
// organisation is actually modelled to carry.
//
// ponytail: ratio thresholds still hardcoded, just no longer meaningless.
// They belong in org configuration alongside the green threshold — move them
// there when an org can configure anything at all.
const APPETITE_CONSERVATIVE_MAX = 0.5;
const APPETITE_MODERATE_MAX = 1.5;
type ToleranceBand = "none" | "conservative" | "moderate" | "high";

function bandForTolerance(value: number | null, meanAle: number | null): ToleranceBand {
  if (value === null) return "none";
  // Without a run there is nothing to be relative TO. Saying nothing beats
  // falling back to the absolute bands this exists to remove.
  if (meanAle === null || meanAle <= 0) return "none";
  const ratio = value / meanAle;
  if (ratio < APPETITE_CONSERVATIVE_MAX) return "conservative";
  if (ratio < APPETITE_MODERATE_MAX) return "moderate";
  return "high";
}

const TOLERANCE_BAND_LABEL: Record<ToleranceBand, string> = {
  none: "",
  conservative: "Conservative appetite",
  moderate: "Moderate appetite",
  high: "High appetite",
};
const TOLERANCE_BAND_TEXT: Record<ToleranceBand, string> = {
  none: "",
  conservative: "text-emerald-400",
  moderate: "text-amber-400",
  high: "text-risk",
};
const TOLERANCE_BAND_BORDER: Record<ToleranceBand, string> = {
  none: "border-border",
  conservative: "border-emerald-500/60",
  moderate: "border-amber-500/60",
  high: "border-risk/60",
};

const GRID_COLOR = "rgba(148, 163, 184, 0.08)";
const TICK_COLOR = "rgba(148, 163, 184, 0.65)";

export function Dashboard() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [scenarioId, setScenarioId] = useState("");
  const [threatIds, setThreatIds] = useState<string[]>([]);
  const [riskTolerance, setRiskTolerance] = useState<string>("");

  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  // P2: first paint showed an empty scenario select, an empty tolerance box
  // and no charts, with nothing to say whether that was "loading" or
  // "broken". Tracked explicitly so the skeleton can say which.
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Audit P1: these two failures used to be swallowed. A risk tool that
  // renders a dash where a number belongs, with no indication that a request
  // failed, is worse than one that errors — the reader cannot tell "we
  // simulated this and it is unavailable" from "we never asked".
  const [historyError, setHistoryError] = useState<string | null>(null);
  // G4: who is signed in, so the governance card can offer (or withhold)
  // sign-off. This only decides what to render — the server re-checks.
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);
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
  // Cost-Benefit / ROSI (Return on Security Investment) — the FAIR method's
  // actual purpose: turning "P(loss>tolerance) went from red to green" into
  // "this control spend pays for itself N times over," which is the
  // sentence a budget-holder needs, not a probability.
  const [annualControlCost, setAnnualControlCost] = useState("");

  async function loadScenarios() {
    try {
      const res = await fetch("/api/scenarios", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setScenarios(data.scenarios);
      setThreats(data.threats);
      if (data.scenarios[0]) {
        setScenarioId((prev) => prev || data.scenarios[0].id);
        const s0 = data.scenarios[0];
        const typicalLoss = s0.primaryLossMode + s0.secondaryLossProbability * s0.secondaryLossMode;
        const seeded = Math.round(typicalLoss / DEFAULT_TOLERANCE_STEP) * DEFAULT_TOLERANCE_STEP;
        setRiskTolerance((prev) => prev || String(seeded));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setScenariosLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/risk", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setHistory(data.history);
      setHistoryError(null);
    } catch (err) {
      // A failed load still must not block the rest of the dashboard, but it
      // does have to be visible: the trend chart simply vanishing reads as
      // "no history yet", which is a different and wrong claim.
      setHistoryError(err instanceof Error ? err.message : "Could not load assessment history");
    }
  }

  useEffect(() => {
    loadScenarios();
    loadHistory();
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setViewer(d?.user ?? null))
      .catch(() => setViewer(null));
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

  // Single entry point for both the slider and the number box: rejects
  // non-numeric input (keeps the previous value instead), and clamps to
  // [0, MAX_TOLERANCE] — a pasted negative or absurdly large number can no
  // longer reach state, let alone the simulation, silently.
  function handleToleranceChange(raw: string) {
    setRiskTolerance((prev) => {
      if (raw === "") return "";
      const n = Number(raw);
      if (!Number.isFinite(n)) return prev;
      return String(Math.min(Math.max(Math.round(n), 0), MAX_TOLERANCE));
    });
  }

  const selectedScenario = scenarios.find((s) => s.id === scenarioId);
  const toleranceValue = riskTolerance ? Number(riskTolerance) : null;
  const latestRun = runs[0] ?? null;
  // M9: the band is relative to the modelled mean ALE, so it has to be
  // derived AFTER latestRun exists.
  const toleranceBand = bandForTolerance(toleranceValue, latestRun?.result.meanAle ?? null);

  // P3: the domain used to be the last run's largest simulated loss — the
  // noisiest statistic available — so ceiling and step moved after every run
  // and a tolerance set by dragging could land elsewhere next time. Now
  // quantised off P90, it moves only when the scenario genuinely does.
  const { max: toleranceSliderMax, step: toleranceSliderStep } = toleranceSliderDomain(
    latestRun?.result.p90Ale ?? null,
    DEFAULT_TOLERANCE_MAX
  );

  // M1: this used to interpolate the 41-point curve client-side, producing a
  // THIRD estimate that disagreed with the server's (and with the value
  // persisted to the database) by about a percentage point — at a 10% decision
  // boundary. It now re-scores the server's own sample with the server's own
  // function, so dragging the tolerance stays instant AND exact.
  const liveExceedProbability = useMemo(() => {
    if (!latestRun || toleranceValue === null) return null;
    const sample = latestRun.result.sortedLosses;
    if (!sample) return latestRun.result.pExceedTolerance;
    return exceedanceProbability(sample, toleranceValue);
  }, [latestRun, toleranceValue]);

  const liveExceedError = useMemo(() => {
    if (!latestRun || liveExceedProbability === null) return null;
    return standardErrorOfProportion(liveExceedProbability, latestRun.result.trials);
  }, [latestRun, liveExceedProbability]);

  // M4: no longer inverted from a grid — the engine returns the quantile that
  // IS the P90, so the recommendation and the tile cannot disagree.
  const requiredToleranceForGreen = latestRun?.result.toleranceForGreen ?? null;

  // Seed the what-if panel from the real latest run whenever it changes, but
  // nudged +10 points above today's actual coverage (not equal to it): if the
  // panel opened at exactly today's numbers, "expected annual loss avoided"
  // and ROSI would both start at ~$0 by construction (comparing a state to
  // itself), which reads as broken math rather than as "you haven't changed
  // anything yet."
  useEffect(() => {
    if (!latestRun) return;
    setWhatIfCoverage(Math.min(100, Math.round(latestRun.avgControlCoveragePct) + 10));
    setWhatIfThreatIds(latestRun.threatIds);
  }, [latestRun]);

  // Debounced live re-simulation as the user drags the coverage slider or
  // toggles threats — a real 4,000-trial run per change, so it waits for a
  // pause rather than firing on every pixel of drag.
  //
  // S7: this used to fire 1 + N requests per tick — one for the current set,
  // one per threat for the "without it" weights. With five threats that was
  // six authenticated Monte Carlo invocations per 400ms of dragging. The
  // server now computes the leave-one-out variants in the same call, off the
  // same seeded sample, so it is one request and the marginal weights are
  // common-random-numbers comparable with the headline instead of being
  // independent draws.
  useEffect(() => {
    if (!whatIfOpen || !scenarioId || toleranceValue === null) return;
    setWhatIfLoading(true);
    const handle = setTimeout(async () => {
      const requestId = ++whatIfRequestId.current;
      setWhatIfError(null);
      try {
        const res = await fetch("/api/risk/whatif", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId,
            threatIds: whatIfThreatIds,
            riskTolerance: toleranceValue,
            coveragePct: whatIfCoverage,
            // Common random numbers: evaluate the hypothetical on the SAME
            // sampled years as the baseline it will be differenced against
            // (audit M7), at the same trial count.
            seed: latestRun?.result.seed,
            trials: latestRun?.result.trials,
            leaveOneOut: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Simulation failed (${res.status})`);
        if (requestId !== whatIfRequestId.current) return; // a newer drag superseded this one
        setWhatIfResult(data.result as FairResult);
        setPerThreatWithoutResult((data.without ?? {}) as Record<string, number | null>);
      } catch (err) {
        // Only the live request gets to report — a superseded drag failing
        // must not paint an error over a newer, successful run.
        if (requestId === whatIfRequestId.current) {
          setWhatIfError(err instanceof Error ? err.message : "Simulation failed");
          setWhatIfResult(null);
          setPerThreatWithoutResult({});
        }
      } finally {
        if (requestId === whatIfRequestId.current) setWhatIfLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [whatIfOpen, scenarioId, whatIfThreatIds, whatIfCoverage, toleranceValue, latestRun]);

  // Computed once per scenario/tolerance (not on every drag) — the best case
  // actually achievable through controls: 100% coverage, holding TODAY'S
  // real threat landscape fixed. Threats aren't a checkbox you get to
  // uncheck in reality — phishing doesn't stop existing because you'd like
  // a better number — so the ceiling check must never zero them out. The
  // per-threat checkboxes below stay available for exploring which threat
  // matters most, but the "here's what's actually achievable" figure only
  // ever varies the lever an org actually controls: control investment.
  useEffect(() => {
    if (!whatIfOpen || !scenarioId || toleranceValue === null || !latestRun) {
      setBestCaseFloor(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/risk/whatif", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId,
            threatIds: latestRun.threatIds,
            riskTolerance: toleranceValue,
            coveragePct: 100,
            seed: latestRun.result.seed,
            trials: latestRun.result.trials,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error ?? `Simulation failed (${res.status})`);
        setBestCaseFloor(data.result.pExceedTolerance);
      } catch (err) {
        // The ceiling check is a hint rather than a headline, so it degrades
        // to absent instead of blanking the panel — but it says that it did.
        if (!cancelled) {
          setBestCaseFloor(null);
          setWhatIfError((prev) => prev ?? (err instanceof Error ? err.message : "Simulation failed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [whatIfOpen, scenarioId, toleranceValue, latestRun]);

  const whatIfExceedProbability = whatIfResult?.pExceedTolerance ?? null;
  const whatIfIsGreen = whatIfExceedProbability !== null && whatIfExceedProbability <= TARGET_EXCEED_PROBABILITY;

  // Risk reduction is a mean-ALE delta (dollars/year avoided), not a
  // probability delta — that's what a cost figure can be compared against.
  const riskReductionValue =
    latestRun && whatIfResult ? latestRun.result.meanAle - whatIfResult.meanAle : null;
  const annualControlCostValue = annualControlCost ? Number(annualControlCost) : null;

  // M7: the two sides of this subtraction are independent samples, so their
  // difference carries the noise of both. When the difference sits inside that
  // noise, its SIGN can flip between runs — and the panel was asserting "the
  // investment more than pays for itself" on exactly that. Below the
  // separation threshold we say so instead of stating a verdict.
  const riskReductionIsReal =
    latestRun !== null &&
    whatIfResult !== null &&
    separated(latestRun.result.meanAle, latestRun.result.seMeanAle, whatIfResult.meanAle, whatIfResult.seMeanAle);

  const rosiPct =
    riskReductionValue !== null && riskReductionIsReal && annualControlCostValue && annualControlCostValue > 0
      ? ((riskReductionValue - annualControlCostValue) / annualControlCostValue) * 100
      : null;

  // Audit A1: each chart memo returns its text alternative alongside its
  // configuration, so the two are derived from one set of numbers and cannot
  // drift. Every summary states the headline VALUES, not just the chart type.
  const histogramChart = useMemo<ChartSpec | null>(() => {
    if (!latestRun) return null;
    const { histogram } = latestRun.result;
    // M11: the bucket CONTAINING the tolerance was painted fully red, though
    // only the portion above the line breaches. With 24 buckets over ~$41M
    // that is up to ~$1.7M of loss shown as a breach that is not one, in the
    // most-glanced-at chart in the product. A bucket is now red only when it
    // lies entirely above the tolerance; the straddling one is amber.
    const straddlingIdx =
      toleranceValue !== null
        ? histogram.findIndex((b) => toleranceValue >= b.rangeStart && toleranceValue < b.rangeEnd)
        : -1;
    const isBreachBucket = (b: HistogramBucket) => toleranceValue !== null && b.rangeStart >= toleranceValue;
    const { trials, meanAle, p50Ale, p90Ale, sortedLosses } = latestRun.result;
    // M1/M11: the count of breaching YEARS comes from the sample via the one
    // estimator, not by summing whole buckets — buckets are a drawing grid and
    // summing them double-counts the straddling one.
    const overTolerance =
      toleranceValue !== null && sortedLosses
        ? Math.round(exceedanceProbability(sortedLosses, toleranceValue) * trials)
        : null;
    const config: ChartConfiguration<any> = {
      type: "bar",
      data: {
        labels: histogram.map((b) => currency(b.rangeStart)),
        datasets: [
          {
            label: "Simulated years",
            data: histogram.map((b) => b.count),
            backgroundColor: histogram.map((b, i) =>
              isBreachBucket(b) ? "#ff453a" : i === straddlingIdx ? "#ff9f0a" : "#0a84ff"
            ),
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
          // P6/M12: this used compact notation ("$16.9M–$18.1M") for what
          // reads as an exact range. Those were Intl compact-rounded values,
          // not the bucket's real edges. Compact belongs on axes, where space
          // is the constraint; a detail readout shows the actual numbers.
          setHistogramDetail(
            `${currencyFull(b.rangeStart)}–${currencyFull(b.rangeEnd)}: ${b.count} of ${latestRun.result.trials} simulated years (${pct}%)`
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
    return {
      config,
      summary:
        `Histogram of annual loss across ${trials.toLocaleString()} simulated years. ` +
        `Mean ${currencyFull(meanAle)}, median ${currencyFull(p50Ale)}, ` +
        `90th percentile ${currencyFull(p90Ale)}.` +
        // findIndex also returns -1 when the tolerance sits ABOVE the whole
        // sample, which is a real and different answer — "no year breached it"
        // is not the same statement as "no tolerance was set".
        (toleranceValue === null
          ? " No risk tolerance is set, so no band is marked as a breach."
          : overTolerance === null
          ? ` No simulated year reached the ${currencyFull(toleranceValue)} tolerance.`
          : ` ${overTolerance.toLocaleString()} of those years (${((overTolerance / trials) * 100).toFixed(1)}%) land above the ${currencyFull(toleranceValue)} tolerance.`),
      table: {
        caption: `Simulated annual loss by band, ${trials.toLocaleString()} trials`,
        head: ["Loss band", "Simulated years", "Share of years", "Above tolerance"],
        rows: histogram.map((b, i) => [
          `${currency(b.rangeStart)}–${currency(b.rangeEnd)}`,
          b.count,
          `${((b.count / trials) * 100).toFixed(1)}%`,
          isBreachBucket(b) ? "yes" : i === straddlingIdx ? "partly — the tolerance falls inside this band" : "no",
        ]),
      },
    };
  }, [latestRun, toleranceValue]);

  const lecChart = useMemo<ChartSpec | null>(() => {
    if (runs.length === 0) return null;
    const config: ChartConfiguration<any> = {
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
            `${run.label} — at ${currencyFull(point.loss)}: ${formatPercent(point.probability)} probability of exceeding`
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
    // The curve is 240 points per run — useless read aloud. The percentiles
    // are what anyone actually takes off it, and they come from the same
    // single estimator the curve does (audit M1), so the table is the chart.
    return {
      config,
      summary:
        `Loss exceedance curve${runs.length > 1 ? ` comparing ${runs.length} runs` : ""}. ` +
        runs
          .map(
            (run) =>
              `${run.label}: half of simulated years exceed ${currencyFull(run.result.p50Ale)}, ` +
              `one year in ten exceeds ${currencyFull(run.result.p90Ale)}.`
          )
          .join(" "),
      table: {
        caption: "Annual loss at each exceedance probability, by run",
        head: ["Run", "Exceeded in 90% of years (P10)", "Exceeded in 50% of years (P50)", "Exceeded in 10% of years (P90)", "Mean"],
        rows: runs.map((run) => [
          run.label,
          currencyFull(run.result.p10Ale),
          currencyFull(run.result.p50Ale),
          currencyFull(run.result.p90Ale),
          currencyFull(run.result.meanAle),
        ]),
      },
    };
  }, [runs]);

  const trendChart = useMemo<ChartSpec | null>(() => {
    if (history.length === 0) return null;
    const ordered = [...history].reverse();
    const config: ChartConfiguration<any> = {
      type: "line",
      data: {
        labels: ordered.map((h) =>
          new Date(h.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        ),
        datasets: [
          {
            label: "Mean ALE",
            data: ordered.map((h) => h.meanAle),
            borderColor: "#0a84ff",
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
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const direction =
      ordered.length < 2
        ? "a single assessment, so there is no trend yet"
        : last.meanAle > first.meanAle
        ? `rising from ${currencyFull(first.meanAle)} to ${currencyFull(last.meanAle)}`
        : last.meanAle < first.meanAle
        ? `falling from ${currencyFull(first.meanAle)} to ${currencyFull(last.meanAle)}`
        : `flat at ${currencyFull(last.meanAle)}`;
    return {
      config,
      summary: `Mean annual loss expectancy across ${ordered.length} saved assessment${
        ordered.length === 1 ? "" : "s"
      }, ${direction}.`,
      table: {
        caption: "Mean annual loss expectancy by assessment date",
        head: ["Assessment date (UTC)", "Mean ALE"],
        rows: ordered.map((h) => [
          new Date(h.createdAt).toISOString().replace("T", " ").slice(0, 16) + " UTC",
          currencyFull(h.meanAle),
        ]),
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

      {scenariosLoading && !loadError ? (
        <ControlPanelSkeleton />
      ) : (
      <div className="rounded-xl border border-border bg-surface p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <SelectDropdown
            label="Industry Scenario"
            options={scenarios.map((s) => ({ id: s.id, label: s.name }))}
            value={scenarioId}
            onChange={setScenarioId}
          />

          <MultiSelectDropdown
            label="Threat Types (select any number)"
            placeholder="Baseline (no threat modifier)"
            itemNoun="threats"
            options={threats.map((t) => ({ id: t.id, label: t.name, description: t.description }))}
            selected={threatIds}
            onChange={setThreatIds}
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span id="risk-tolerance-label" className="text-xs font-medium text-slate-400 truncate">
                Risk Tolerance (annual, USD)
              </span>
              <span
                className={`text-[11px] font-medium whitespace-nowrap shrink-0 ${TOLERANCE_BAND_TEXT[toleranceBand]}`}
              >
                {TOLERANCE_BAND_LABEL[toleranceBand]}
                {toleranceBand !== "none" && latestRun && toleranceValue !== null && (
                  <span className="text-slate-500">
                    {" "}
                    ({(toleranceValue / latestRun.result.meanAle).toFixed(2)}x modelled mean ALE)
                  </span>
                )}
              </span>
            </div>
            <input
              type="range"
              aria-labelledby="risk-tolerance-label"
              min={0}
              max={toleranceSliderMax}
              step={toleranceSliderStep}
              value={toleranceValue ?? 0}
              onChange={(e) => handleToleranceChange(e.target.value)}
              className="w-full accent-accent"
            />
            <input
              type="number"
              aria-labelledby="risk-tolerance-label"
              min={0}
              max={MAX_TOLERANCE}
              value={riskTolerance}
              onChange={(e) => handleToleranceChange(e.target.value)}
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
            className="btn-primary"
          >
            {running ? `Running ${DEFAULT_TRIALS.toLocaleString()} trials…` : "Run Simulation"}
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
              {runs.length > 1 ? `Clear comparison (${runs.length})` : "Clear run"}
            </button>
          )}
        </div>
      </div>
      )}

      {latestRun && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Mean ALE" value={currencyFull(latestRun.result.meanAle)} />
            <StatCard label="P50 ALE" value={currencyFull(latestRun.result.p50Ale)} />
            <StatCard label="P90 ALE" value={currencyFull(latestRun.result.p90Ale)} />
            <StatCard
              label="P(loss > tolerance)"
              value={
                liveExceedProbability !== null
                  ? formatPercentWithError(liveExceedProbability, liveExceedError ?? 0)
                  : "—"
              }
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
                  At today&apos;s threats and control coverage, tolerance would need to be{" "}
                  <span className="text-emerald-400 font-medium">{currencyFull(requiredToleranceForGreen)}</span> or
                  higher to go green.{" "}
                </>
              ) : (
                <>Raising the tolerance alone won&apos;t turn this green within the simulated range — </>
              )}
              <button onClick={() => setWhatIfOpen((v) => !v)} className="text-accent2 underline hover:no-underline">
                Try lowering risk instead
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
                    Ceiling check: even at 100% control coverage, keeping today&apos;s full threat set in scope, this
                    scenario still exceeds tolerance {(bestCaseFloor * 100).toFixed(2)}% of the time. Green
                    isn&apos;t achievable at {currencyFull(toleranceValue ?? 0)} through control investment alone —
                    raise the tolerance to a realistic level, or treat the remainder as a case for risk transfer
                    (insurance) rather than more controls.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">
                    Ceiling check: at 100% control coverage, keeping today&apos;s full threat set in scope, this
                    scenario drops to{" "}
                    <span className="text-emerald-400 font-medium">{(bestCaseFloor * 100).toFixed(2)}%</span> — green
                    is achievable through control investment alone, without pretending any threat away.{" "}
                    <button
                      onClick={() => {
                        setWhatIfCoverage(100);
                        setWhatIfThreatIds(latestRun.threatIds);
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
                      Threats included — toggle one off, or read &quot;without it&quot; to see its weight
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {threats.map((t) => {
                        const included = whatIfThreatIds.includes(t.id);
                        const isLastOne = included && whatIfThreatIds.length === 1;
                        const withoutIt = perThreatWithoutResult[t.id];
                        const withoutItGreen = withoutIt !== null && withoutIt !== undefined && withoutIt <= TARGET_EXCEED_PROBABILITY;
                        return (
                          <label
                            key={t.id}
                            className={`flex items-center gap-2 text-sm ${isLastOne ? "text-slate-500" : "text-slate-300"}`}
                            title={isLastOne ? "At least one threat has to stay in scope — a zero-threat landscape isn't real." : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={included}
                              disabled={isLastOne}
                              onChange={(e) =>
                                setWhatIfThreatIds((prev) =>
                                  e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                                )
                              }
                            />
                            <span className="flex-1">{t.name}</span>
                            {included && withoutIt !== null && withoutIt !== undefined && !isLastOne && (
                              <span className={`text-[11px] ${withoutItGreen ? "text-emerald-400 font-medium" : "text-slate-500"}`}>
                                without it: {(withoutIt * 100).toFixed(2)}%{withoutItGreen ? " ✓" : ""}
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
                  {whatIfError && (
                    <p role="status" className="text-xs text-amber-300 mb-2">
                      Could not re-simulate: {whatIfError}. Whatever is shown below is stale or unavailable — treat it
                      as absent, not as a result.
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-2xl font-semibold tabular-nums ${whatIfIsGreen ? "text-emerald-400" : "text-risk"}`}>
                      {whatIfExceedProbability !== null
                        ? formatPercentWithError(whatIfExceedProbability, whatIfResult?.sePExceedTolerance ?? 0)
                        : "—"}
                    </span>
                    {whatIfExceedProbability !== null && (
                      <StatusBadge status={whatIfIsGreen ? "pass" : "fail"}>
                        {whatIfIsGreen ? "Within appetite" : "Above appetite"}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {whatIfIsGreen
                      ? `At ${whatIfCoverage}% control coverage with ${whatIfThreatIds.length} threat${
                          whatIfThreatIds.length === 1 ? "" : "s"
                        } still in scope, this drops under the ${(TARGET_EXCEED_PROBABILITY * 100).toFixed(0)}% bar — that's the combination to take to the board as the mitigation plan.`
                      : `vs. ${
                          liveExceedProbability !== null
                            ? formatPercentWithError(liveExceedProbability, liveExceedError ?? 0)
                            : "—"
                        } today. Drag coverage up to see what it takes to go green — dropping a threat only tells you its weight, it isn't a real mitigation.`}
                  </p>
                </div>
              </div>
            )}
            {whatIfOpen && (
              <div className="mt-4 rounded-lg border border-border p-4">
                <span className="text-xs font-medium text-slate-400 block mb-3">
                  Cost-benefit of this control investment (ROSI)
                </span>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-slate-500">
                      Estimated annual cost to reach {whatIfCoverage}% coverage (USD)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={annualControlCost}
                      onChange={(e) => setAnnualControlCost(e.target.value)}
                      placeholder="e.g. 150000"
                      className="select"
                    />
                  </label>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Expected annual loss avoided</div>
                    <div className="text-lg font-semibold tabular-nums text-slate-100">
                      {riskReductionValue === null
                        ? "—"
                        : riskReductionIsReal
                        ? currencyFull(Math.max(riskReductionValue, 0))
                        : "Not measurable"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Return on security investment</div>
                    <div
                      className={`text-lg font-semibold tabular-nums ${
                        rosiPct === null ? "text-slate-100" : rosiPct >= 0 ? "text-emerald-400" : "text-risk"
                      }`}
                    >
                      {rosiPct !== null
                        ? `${rosiPct >= 0 ? "+" : ""}${rosiPct.toFixed(0)}% ${rosiPct >= 0 ? "(pays for itself)" : "(costs more than it avoids)"}`
                        : annualControlCostValue && !riskReductionIsReal
                        ? "Inside the noise"
                        : "Enter a cost"}
                    </div>
                  </div>
                </div>
                {rosiPct !== null && (
                  <p className="text-xs text-slate-500 mt-3">
                    {rosiPct >= 0
                      ? `For every $1 spent reaching ${whatIfCoverage}% coverage, this avoids ~$${(
                          1 +
                          rosiPct / 100
                        ).toFixed(2)} in expected annual loss — the investment more than pays for itself at this scenario's simulated loss profile.`
                      : `At this cost, the annual loss avoided doesn't cover the spend — either the cost estimate is high for this scenario's risk, or the coverage target should be lower.`}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Simulated Annual Loss Distribution" detail={histogramDetail} hint="Click a bar for detail">
              {histogramChart && <ChartCanvas {...histogramChart} />}
            </ChartCard>
            <ChartCard
              title={runs.length > 1 ? "Loss Exceedance Curve — comparing runs" : "Loss Exceedance Curve"}
              detail={lecDetail}
              hint="Click the curve for detail · run again to compare"
            >
              {lecChart && <ChartCanvas {...lecChart} />}
            </ChartCard>
          </div>
        </>
      )}

      {history[0] && (
        <AssessmentGovernance assessment={history[0]} viewer={viewer} onApproved={loadHistory} />
      )}

      {historyError ? (
        <ChartCard title="Mean ALE Over Time (Audit Trail)">
          <p role="status" className="text-sm text-amber-300">
            Could not load assessment history: {historyError}. This is a load failure, not an empty trend — past
            assessments may well exist.
          </p>
        </ChartCard>
      ) : (
        trendChart && (
          <ChartCard title="Mean ALE Over Time (Audit Trail)">
            <ChartCanvas {...trendChart} />
          </ChartCard>
        )
      )}
    </>
  );
}

// P2: a skeleton that says it is loading rather than an empty form that looks
// broken. aria-busy + a live region mean a screen reader is told the same
// thing the animation tells a sighted user, instead of being read an empty
// panel and then silently re-read a populated one.
function ControlPanelSkeleton() {
  return (
    <div
      className="rounded-xl border border-border bg-surface p-5 mb-6"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="sr-only">Loading scenarios and threat catalogue.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {["Industry Scenario", "Threat Types", "Risk Tolerance"].map((label) => (
          <div key={label} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-500">{label}</span>
            <div className="h-9 rounded-lg bg-white/5 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="h-3 w-2/3 rounded bg-white/5 animate-pulse mb-4" />
      <div className="h-9 w-40 rounded-lg bg-white/5 animate-pulse" />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "risk" | "safe" }) {
  const color = accent === "risk" ? "text-risk" : accent === "safe" ? "text-emerald-400" : "text-slate-100";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-mono font-semibold tabular-nums ${color}`}>
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
