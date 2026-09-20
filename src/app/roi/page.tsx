"use client";

// Return on Security Investment (ROSI) analysis — the FAIR method's actual
// business purpose. A risk register in isolation just tells you "this is
// red"; this page tells you what it costs to make it green, and whether
// that spend is worth it, which is the sentence a budget-holder needs.
//
// Cost model: the only input we don't get from a simulation is "what does
// it cost to reach X% control coverage" — nobody has that lying around, so
// we ask for the annual cost of reaching 100% and assume it scales linearly
// with coverage. That's a modeling simplification, not measured data, and
// the page says so — the same "documented assumption, not sourced" stance
// the rest of the FAIR model takes (see src/lib/scenarios.ts).
import { useEffect, useMemo, useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { AppShell } from "@/components/AppShell";
import { ChartCanvas } from "@/components/ChartCanvas";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";

interface Scenario {
  id: string;
  name: string;
  industry: string;
}
interface Threat {
  id: string;
  name: string;
}
interface ControlRow {
  coveragePct: number;
}
interface CurvePoint {
  coverage: number;
  meanAle: number;
  pExceedTolerance: number | null;
  cost: number;
  riskAvoided: number;
  netBenefit: number;
  rosiPct: number | null;
}

const COVERAGE_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
const currencyFull = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

export default function RoiPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [threatIds, setThreatIds] = useState<string[]>([]);
  const [riskTolerance, setRiskTolerance] = useState("");
  const [costAt100, setCostAt100] = useState("");
  const [curve, setCurve] = useState<CurvePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Real current control coverage (same average shown on Control Posture),
  // not just a hypothetical sweep — this is what anchors the curve to where
  // the organization actually stands today instead of pure theory.
  const [currentCoveragePct, setCurrentCoveragePct] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data) => {
        setScenarios(data.scenarios);
        setThreats(data.threats);
        setScenarioId(data.scenarios[0]?.id ?? "");
        // Baseline (no extra threats) by default — matches the dashboard's
        // own default. Stacking every threat community here inflates ALE
        // to the point where no realistic control budget looks meaningful
        // against it, which is what made this page look unresponsive.
        const controls = (data.controls ?? []) as ControlRow[];
        if (controls.length > 0) {
          const avg = controls.reduce((sum, c) => sum + (c.coveragePct ?? 0), 0) / controls.length;
          setCurrentCoveragePct(Math.round(avg));
        }
      })
      .catch(() => setLoadError("Failed to load scenarios"));
  }, []);

  // The sweep always includes 0/10/…/100, plus today's actual coverage so
  // it's a real simulated point on the curve, not an eyeballed interpolation
  // between two grid lines.
  const coverageSteps = useMemo(() => {
    const steps = new Set(COVERAGE_STEPS);
    if (currentCoveragePct !== null) steps.add(currentCoveragePct);
    return Array.from(steps).sort((a, b) => a - b);
  }, [currentCoveragePct]);

  // Re-run the coverage sweep whenever the inputs that affect it change.
  // Debounced the same way the dashboard's what-if panel is — this fires on
  // every keystroke/drag otherwise.
  useEffect(() => {
    if (!scenarioId) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      const tolerance = riskTolerance ? Number(riskTolerance) : null;
      const cost100 = costAt100 ? Number(costAt100) : 0;
      try {
        const results = await Promise.all(
          coverageSteps.map(async (coverage) => {
            const res = await fetch("/api/risk/whatif", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scenarioId, threatIds, riskTolerance: tolerance, coveragePct: coverage }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Simulation failed");
            return { coverage, result: data.result as { meanAle: number; pExceedTolerance: number | null } };
          })
        );
        const baselineAle = results.find((r) => r.coverage === 0)!.result.meanAle;
        const points: CurvePoint[] = results.map(({ coverage, result }) => {
          // Cost scales with the SQUARE of coverage, not linearly: the first
          // half of coverage is the cheap, high-leverage fixes (MFA, patch
          // management); closing the last gap costs disproportionately more.
          // A linear cost curve against a roughly-linear risk-reduction curve
          // can only ever "optimize" at 0% or 100% — never in between — which
          // is a degenerate result, not a real trade-off. Convex cost is what
          // makes an interior optimum possible at all.
          const cost = cost100 * (coverage / 100) ** 2;
          const riskAvoided = baselineAle - result.meanAle;
          const netBenefit = riskAvoided - cost;
          const rosiPct = cost > 0 ? (netBenefit / cost) * 100 : null;
          return { coverage, meanAle: result.meanAle, pExceedTolerance: result.pExceedTolerance, cost, riskAvoided, netBenefit, rosiPct };
        });
        setCurve(points);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Simulation failed");
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [scenarioId, threatIds, riskTolerance, costAt100, coverageSteps]);

  const optimalPoint = useMemo(() => {
    if (curve.length === 0) return null;
    return curve.reduce((best, p) => (p.netBenefit > best.netBenefit ? p : best), curve[0]);
  }, [curve]);

  const currentPoint = useMemo(() => {
    if (currentCoveragePct === null) return null;
    return curve.find((p) => p.coverage === currentCoveragePct) ?? null;
  }, [curve, currentCoveragePct]);

  const lossVsCostConfig: ChartConfiguration<"line"> | null = useMemo(() => {
    if (curve.length === 0) return null;
    // Highlight whichever point is today's real coverage — bigger, amber —
    // so the curve reads against reality, not just as an abstract sweep.
    const pointStyle = (color: string) =>
      curve.map((p) => (p.coverage === currentCoveragePct ? "#f59e0b" : color));
    const pointSize = curve.map((p) => (p.coverage === currentCoveragePct ? 6 : 3));
    return {
      type: "line",
      data: {
        labels: curve.map((p) => `${p.coverage}%`),
        datasets: [
          {
            label: "Expected Annual Loss",
            data: curve.map((p) => p.meanAle),
            borderColor: "#f43f5e",
            backgroundColor: "#f43f5e22",
            pointBackgroundColor: pointStyle("#f43f5e"),
            pointRadius: pointSize,
            tension: 0.25,
            fill: false,
          },
          {
            label: "Cumulative Control Cost",
            data: curve.map((p) => p.cost),
            borderColor: "#0891b2",
            backgroundColor: "#0891b222",
            pointBackgroundColor: pointStyle("#0891b2"),
            pointRadius: pointSize,
            tension: 0.25,
            fill: false,
            borderDash: [5, 4],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Control coverage" }, grid: { color: "#26324a" }, ticks: { color: "#94a3b8" } },
          y: {
            ticks: { color: "#94a3b8", callback: (v: any) => currency(Number(v)) },
            grid: { color: "#26324a" },
          },
        },
        plugins: { legend: { labels: { color: "#cbd5e1" } } },
      },
    };
  }, [curve, currentCoveragePct]);

  const netBenefitConfig: ChartConfiguration<"bar"> | null = useMemo(() => {
    if (curve.length === 0) return null;
    return {
      type: "bar",
      data: {
        labels: curve.map((p) => `${p.coverage}%`),
        datasets: [
          {
            label: "Net benefit (risk avoided − cost)",
            data: curve.map((p) => p.netBenefit),
            backgroundColor: curve.map((p) => {
              if (optimalPoint && p.coverage === optimalPoint.coverage) return "#10b981"; // optimal wins ties
              if (p.coverage === currentCoveragePct) return "#f59e0b"; // today
              return p.netBenefit >= 0 ? "#3454d1" : "#f43f5e";
            }),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Control coverage" }, grid: { display: false }, ticks: { color: "#94a3b8" } },
          y: {
            ticks: { color: "#94a3b8", callback: (v: any) => currency(Number(v)) },
            grid: { color: "#26324a" },
          },
        },
        plugins: { legend: { display: false } },
      },
    };
  }, [curve, optimalPoint]);

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Return on Security Investment</h1>
        <p className="text-slate-400 mt-1">
          Where control spend stops paying for itself — the marginal-returns question a risk register alone can&apos;t
          answer.
        </p>
      </header>

      {loadError && (
        <div className="mb-6 rounded-lg border border-risk/30 bg-risk/10 text-risk px-4 py-3 text-sm">{loadError}</div>
      )}

      <div className="rounded-xl border border-border bg-surface p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Scenario</span>
            <select className="select" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <MultiSelectDropdown
            label="Threats in scope"
            placeholder="Baseline"
            itemNoun="threats"
            options={threats.map((t) => ({ id: t.id, label: t.name }))}
            selected={threatIds}
            onChange={setThreatIds}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Risk tolerance (USD/year, optional)</span>
            <input
              className="select"
              type="number"
              min={0}
              value={riskTolerance}
              onChange={(e) => setRiskTolerance(e.target.value)}
              placeholder="e.g. 5000000"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Annual cost to reach 100% coverage (USD)</span>
            <input
              className="select"
              type="number"
              min={0}
              value={costAt100}
              onChange={(e) => setCostAt100(e.target.value)}
              placeholder="e.g. 400000"
            />
          </label>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Cost is modeled as scaling with the square of coverage — cheap early wins, disproportionately expensive to
          close the last gap — not a sourced budget curve. Enter what full (100%) remediation would realistically cost.
        </p>
      </div>

      {currentPoint && costAt100 && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-5 mb-6">
          <div className="text-xs font-medium text-slate-400 mb-1">Where you stand today (actual coverage)</div>
          <div className="text-xl font-mono font-semibold text-slate-100">{currentPoint.coverage}% control coverage</div>
          <p className="text-sm text-slate-400 mt-2">
            At today&apos;s real coverage, net benefit is {currencyFull(currentPoint.netBenefit)}/year.{" "}
            {optimalPoint && optimalPoint.coverage !== currentPoint.coverage
              ? `Closing the gap to the ${optimalPoint.coverage}% optimum would add another ${currencyFull(
                  optimalPoint.netBenefit - currentPoint.netBenefit
                )}/year in net benefit.`
              : `That's already the model's optimum for this cost estimate.`}
          </p>
        </div>
      )}

      {optimalPoint && costAt100 && (
        <div
          className={`rounded-xl border p-5 mb-6 ${
            optimalPoint.netBenefit >= 0 ? "border-emerald-500/40 bg-emerald-500/5" : "border-risk/40 bg-risk/5"
          }`}
        >
          <div className="text-xs font-medium text-slate-400 mb-1">Optimal investment point</div>
          <div className="text-xl font-mono font-semibold text-slate-100">
            {optimalPoint.coverage}% control coverage
          </div>
          <p className="text-sm text-slate-400 mt-2">
            Net benefit peaks here at {currencyFull(optimalPoint.netBenefit)}/year — {currencyFull(optimalPoint.riskAvoided)}{" "}
            in avoided loss against {currencyFull(optimalPoint.cost)} in control spend
            {optimalPoint.rosiPct !== null ? ` (${optimalPoint.rosiPct >= 0 ? "+" : ""}${optimalPoint.rosiPct.toFixed(0)}% ROSI)` : ""}
            .{" "}
            {optimalPoint.coverage < 100
              ? `Pushing coverage past this point costs more than the risk it removes — the classic diminishing-returns curve behind every "how much security is enough" conversation.`
              : `At this cost, full coverage still returns more than it spends at every step — this control investment dominates the risk regardless of how far you push it. To see an interior trade-off point instead of a corner solution, try a higher cost estimate (roughly ${currencyFull(
                  optimalPoint.riskAvoided * 0.6
                )}+) — that's the range where the model starts weighing cost against risk instead of one obviously winning.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="font-semibold text-slate-100 mb-1">Loss vs. cost, by coverage level</h3>
          <p className="text-xs text-slate-500 mb-3">
            Where the two lines cross is where further spend stops being worth it. The amber point marks today&apos;s
            actual coverage.
          </p>
          <div className="h-72">
            {lossVsCostConfig ? <ChartCanvas config={lossVsCostConfig} /> : <p className="text-sm text-slate-500">{loading ? "Simulating…" : "Pick a scenario to begin."}</p>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="font-semibold text-slate-100 mb-1">Net benefit by coverage level</h3>
          <p className="text-xs text-slate-500 mb-3">
            Green bar is the optimum; amber is today&apos;s actual coverage (if different).
          </p>
          <div className="h-72">
            {netBenefitConfig ? <ChartCanvas config={netBenefitConfig} /> : <p className="text-sm text-slate-500">{loading ? "Simulating…" : "Pick a scenario to begin."}</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
