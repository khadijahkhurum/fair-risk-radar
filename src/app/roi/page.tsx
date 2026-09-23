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
import { ChartCanvas, type ChartSpec } from "@/components/ChartCanvas";
import { StatusBadge } from "@/components/StatusBadge";
import { formatPercent, GREEN_THRESHOLD as TARGET_EXCEED_PROBABILITY } from "@/lib/stats";
// E3: the green threshold lives in src/lib/stats.ts, where the engine reads it
// too — aliased rather than redeclared, so the page and the simulation cannot
// drift apart about what "within appetite" means.
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { SelectDropdown } from "@/components/SelectDropdown";
import { toleranceForTargetProbability, type LecPoint } from "@/lib/lec";
import { newSeed } from "@/lib/rng";

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
  benefitCostRatio: number | null;
  /** Sampling error on this point's net benefit — the width of the plateau (M3c). */
  netBenefitSe: number;
  lec: LecPoint[];
}

const COVERAGE_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
// Every point in a sweep uses this trial count and ONE shared seed, so the
// points are comparable to each other rather than each being an independent
// draw (M3a).
const SWEEP_TRIALS = 4000;
// Same 10% bar the Risk Simulator's green/red rule uses — one constant so the
// two pages can't disagree about what "within tolerance" means.


const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
const currencyFull = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

// M12: one precision policy, in stats.ts, for every surface.
const pctLabel = (p: number | null) => formatPercent(p);
const withinTolerance = (p: number | null) => p !== null && p <= TARGET_EXCEED_PROBABILITY;

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
  // Bumped by the "Recalculate" button — in the sweep effect's own
  // dependency array purely to force a re-run on demand, since 12
  // sequential simulation calls behind a 400ms debounce can take a couple
  // seconds and the old chart otherwise just sits there with no visible
  // sign anything is happening.
  const [refreshNonce, setRefreshNonce] = useState(0);
  // One seed shared by every point of a sweep. Recalculate mints a new one,
  // so "run it again" genuinely resamples rather than replaying the same draw.
  const [sweepSeed, setSweepSeed] = useState(() => newSeed());

  // Re-read today's actual coverage whenever this tab becomes active again.
  // Coverage is edited on another page (often in another tab), and a figure
  // fetched once on mount goes stale the moment someone changes it there —
  // which looks exactly like the number being hardcoded.
  useEffect(() => {
    function refreshCoverage() {
      if (document.visibilityState !== "visible") return;
      fetch("/api/scenarios", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          const rows = (data.controls ?? []) as ControlRow[];
          if (rows.length > 0) {
            setCurrentCoveragePct(Math.round(rows.reduce((sum, c) => sum + (c.coveragePct ?? 0), 0) / rows.length));
          }
        })
        .catch(() => {});
    }
    window.addEventListener("focus", refreshCoverage);
    document.addEventListener("visibilitychange", refreshCoverage);
    return () => {
      window.removeEventListener("focus", refreshCoverage);
      document.removeEventListener("visibilitychange", refreshCoverage);
    };
  }, []);

  useEffect(() => {
    fetch("/api/scenarios", { cache: "no-store" })
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
              body: JSON.stringify({
                scenarioId,
                threatIds,
                riskTolerance: tolerance,
                coveragePct: coverage,
                // M3a — COMMON RANDOM NUMBERS. Every point in the sweep is
                // evaluated on the SAME sampled years, so the noise is shared
                // and cancels in the differences between coverage levels,
                // which is the only thing this curve is read for. Previously
                // each point was an independent simulation and the argmax
                // picked whichever level drew the most favourable noise —
                // producing two different budget recommendations from
                // identical inputs twenty minutes apart.
                seed: sweepSeed,
                trials: SWEEP_TRIALS,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Simulation failed");
            return {
              coverage,
              result: data.result as {
                meanAle: number;
                pExceedTolerance: number | null;
                lec: LecPoint[];
                seMeanAle: number;
              },
            };
          })
        );
        const baseline = results.find((r) => r.coverage === 0)!.result;
        const baselineAle = baseline.meanAle;
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
          // A benefit-cost ratio ("$X returned per $1 spent"), not a raw
          // percentage — at these loss magnitudes a modest control budget
          // produces a percentage in the thousands, which reads as a broken
          // calculation to anyone looking at it rather than an impressive
          // one. A ratio like "225x" or "$225 per $1" is the way this kind
          // of extreme return is actually presented in security economics.
          const benefitCostRatio = cost > 0 ? riskAvoided / cost : null;
          // Conservative: treats the two means as independent, which they are
          // not under common random numbers, so the plateau comes out wider
          // than the truth. For a risk tool, over-stating uncertainty is the
          // safe direction to err.
          const netBenefitSe = Math.sqrt(baseline.seMeanAle ** 2 + result.seMeanAle ** 2);
          return {
            coverage,
            meanAle: result.meanAle,
            pExceedTolerance: result.pExceedTolerance,
            cost,
            riskAvoided,
            netBenefit,
            benefitCostRatio,
            netBenefitSe,
            lec: result.lec ?? [],
          };
        });
        setCurve(points);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Simulation failed");
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [scenarioId, threatIds, riskTolerance, costAt100, coverageSteps, refreshNonce, sweepSeed]);

  const optimalPoint = useMemo(() => {
    if (curve.length === 0) return null;
    return curve.reduce((best, p) => (p.netBenefit > best.netBenefit ? p : best), curve[0]);
  }, [curve]);

  // M3c — the PLATEAU: every coverage level whose net benefit is within one
  // standard error of the peak. Reporting a single argmax point implies a
  // precision the sweep does not have; the honest answer is a band, and the
  // choice inside that band is an operational one rather than a statistical
  // one.
  //
  // ponytail: no curve fitting. Common random numbers already removed the
  // independent-noise problem that made the argmax unstable, and a monotone
  // spline would add a dependency and a second model to defend for a sweep
  // that is 12 points wide. Fit it if the sweep ever gets fine enough that
  // the grid, rather than the noise, is the limiting factor.
  const plateau = useMemo(() => {
    if (!optimalPoint || curve.length === 0) return null;
    const floor = optimalPoint.netBenefit - optimalPoint.netBenefitSe;
    const inBand = curve.filter((p) => p.netBenefit >= floor);
    if (inBand.length === 0) return null;
    const low = Math.min(...inBand.map((p) => p.coverage));
    const high = Math.max(...inBand.map((p) => p.coverage));
    return { low, high, isPoint: low === high, band: inBand };
  }, [curve, optimalPoint]);

  const withinPlateau = (coverage: number | null) =>
    coverage !== null && plateau !== null && coverage >= plateau.low && coverage <= plateau.high;

  const currentPoint = useMemo(() => {
    if (currentCoveragePct === null) return null;
    return curve.find((p) => p.coverage === currentCoveragePct) ?? null;
  }, [curve, currentCoveragePct]);

  // Net benefit says "is this spend worth it"; exceedance says "does it get us
  // inside our stated risk appetite". Those are different questions, and a
  // control program can pass the first while failing the second badly — so the
  // page has to answer both instead of colouring everything green on ROI alone.
  const toleranceSet = riskTolerance !== "" && Number(riskTolerance) > 0;
  const fullCoveragePoint = useMemo(() => curve.find((p) => p.coverage === 100) ?? null, [curve]);
  const ceilingExceedance = fullCoveragePoint?.pExceedTolerance ?? null;
  // The most this scenario's risk can ever be reduced by controls. A cost
  // estimate far above this makes every coverage level value-destroying, and
  // the model's "optimum" collapses to spending nothing — which is a signal
  // about the cost input, not real advice.
  const maxAvoidable = fullCoveragePoint?.riskAvoided ?? null;
  // The lowest coverage level that actually gets inside the appetite bar.
  // "Reachable at 100%" and "red at today's 75%" are both true and read as a
  // contradiction side by side — this is the number that reconciles them.
  // The sweep only samples every 10 points, so "the first sampled level that
  // is green" rounds the requirement UP to the next grid line — reporting
  // "you need 100%" when 91% would actually do. Interpolate between the two
  // bracketing points and round up to the next whole percent instead: same
  // coarse simulation, an answer that is not overstated by up to 10 points.
  const minGreenCoverage = useMemo(() => {
    const idx = curve.findIndex((p) => p.pExceedTolerance !== null && p.pExceedTolerance <= TARGET_EXCEED_PROBABILITY);
    if (idx === -1) return null;
    const hit = curve[idx];
    const prev = idx > 0 ? curve[idx - 1] : null;
    if (!prev || prev.pExceedTolerance === null || hit.pExceedTolerance === null) return hit.coverage;
    const span = prev.pExceedTolerance - hit.pExceedTolerance;
    if (span <= 0) return hit.coverage;
    const t = (prev.pExceedTolerance - TARGET_EXCEED_PROBABILITY) / span;
    return Math.min(100, Math.ceil(prev.coverage + t * (hit.coverage - prev.coverage)));
  }, [curve]);

  // What satisfying the appetite costs ON TOP of the economically optimal
  // spend. These are two different questions — "where does control spend stop
  // paying for itself" and "how much coverage does our stated appetite
  // demand" — and they routinely have different answers. Showing only the
  // second makes the tool look like it always says "buy everything".
  const compliancePremium = useMemo(() => {
    if (!optimalPoint || minGreenCoverage === null || !costAt100) return null;
    if (minGreenCoverage <= optimalPoint.coverage) return null;
    const cost100 = Number(costAt100);
    const costAtGreen = cost100 * (minGreenCoverage / 100) ** 2;
    // Interpolate avoided loss at the green level from the bracketing points.
    const above = curve.find((p) => p.coverage >= minGreenCoverage);
    const below = [...curve].reverse().find((p) => p.coverage <= minGreenCoverage);
    if (!above || !below) return null;
    const avoided =
      above.coverage === below.coverage
        ? above.riskAvoided
        : below.riskAvoided +
          ((minGreenCoverage - below.coverage) / (above.coverage - below.coverage)) *
            (above.riskAvoided - below.riskAvoided);
    return {
      coverage: minGreenCoverage,
      cost: costAtGreen,
      netBenefit: avoided - costAtGreen,
      forgone: optimalPoint.netBenefit - (avoided - costAtGreen),
    };
  }, [optimalPoint, minGreenCoverage, costAt100, curve]);
  const toleranceUnreachable =
    toleranceSet && ceilingExceedance !== null && ceilingExceedance > TARGET_EXCEED_PROBABILITY;
  // If controls can't get there, the actionable answer isn't "spend more" —
  // it's the tolerance that WOULD be green at full coverage. Without this the
  // red banner is a dead end.
  const requiredTolerance = useMemo(
    () => (fullCoveragePoint ? toleranceForTargetProbability(fullCoveragePoint.lec, TARGET_EXCEED_PROBABILITY) : null),
    [fullCoveragePoint]
  );

  // Audit A1: each sweep chart carries its own summary and data table,
  // derived in the same memo from the same curve — a screen-reader user gets
  // the numbers the chart is drawn from, not the word "chart".
  const lossVsCostChart = useMemo<ChartSpec | null>(() => {
    if (curve.length === 0) return null;
    // Highlight whichever point is today's real coverage — bigger, amber —
    // so the curve reads against reality, not just as an abstract sweep.
    const pointStyle = (color: string) =>
      curve.map((p) => (p.coverage === currentCoveragePct ? "#ff9f0a" : color));
    const pointSize = curve.map((p) => (p.coverage === currentCoveragePct ? 6 : 3));
    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels: curve.map((p) => `${p.coverage}%`),
        datasets: [
          {
            label: "Expected Annual Loss",
            data: curve.map((p) => p.meanAle),
            borderColor: "#ff453a",
            backgroundColor: "rgba(255,69,58,0.20)",
            pointBackgroundColor: pointStyle("#ff453a"),
            pointRadius: pointSize,
            tension: 0.25,
            fill: false,
          },
          {
            label: "Cumulative Control Cost",
            data: curve.map((p) => p.cost),
            borderColor: "#64d2ff",
            backgroundColor: "#64d2ff22",
            pointBackgroundColor: pointStyle("#64d2ff"),
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
          x: { title: { display: true, text: "Control coverage" }, grid: { color: "rgba(255,255,255,0.08)" }, ticks: { color: "#98989d" } },
          y: {
            ticks: { color: "#98989d", callback: (v: any) => currency(Number(v)) },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
        plugins: { legend: { labels: { color: "#d1d1d6" } } },
      },
    };
    const lo = curve[0];
    const hi = curve[curve.length - 1];
    return {
      config,
      summary:
        `Expected annual loss and cumulative control cost against control coverage, ` +
        `swept from ${lo.coverage}% to ${hi.coverage}%. ` +
        `Expected loss falls from ${currencyFull(lo.meanAle)} to ${currencyFull(hi.meanAle)} ` +
        `while control cost rises from ${currencyFull(lo.cost)} to ${currencyFull(hi.cost)}.` +
        (currentPoint
          ? ` Today's coverage is ${currentPoint.coverage}%, at ${currencyFull(currentPoint.meanAle)} expected loss for ${currencyFull(currentPoint.cost)} of spend.`
          : ""),
      table: {
        caption: "Expected annual loss and control cost at each coverage level",
        head: ["Control coverage", "Expected annual loss", "Cumulative control cost", "Today's coverage"],
        rows: curve.map((p) => [
          `${p.coverage}%`,
          currencyFull(p.meanAle),
          currencyFull(p.cost),
          p.coverage === currentCoveragePct ? "yes" : "no",
        ]),
      },
    };
  }, [curve, currentCoveragePct, currentPoint]);

  const netBenefitChart = useMemo<ChartSpec | null>(() => {
    if (curve.length === 0) return null;
    const config: ChartConfiguration<"bar"> = {
      type: "bar",
      data: {
        labels: curve.map((p) => `${p.coverage}%`),
        datasets: [
          {
            label: "Net benefit (risk avoided − cost)",
            data: curve.map((p) => p.netBenefit),
            backgroundColor: curve.map((p) => {
              if (optimalPoint && p.coverage === optimalPoint.coverage) return "#30d158"; // optimal wins ties
              if (p.coverage === currentCoveragePct) return "#ff9f0a"; // today
              return p.netBenefit >= 0 ? "#0a84ff" : "#ff453a";
            }),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Control coverage" }, grid: { display: false }, ticks: { color: "#98989d" } },
          y: {
            ticks: { color: "#98989d", callback: (v: any) => currency(Number(v)) },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
        plugins: { legend: { display: false } },
      },
    };
    return {
      config,
      summary:
        `Net benefit (loss avoided minus control cost) at each coverage level. ` +
        (optimalPoint
          ? `Net benefit peaks at ${currencyFull(optimalPoint.netBenefit)} at ${optimalPoint.coverage}% coverage` +
            (plateau && !plateau.isPoint
              ? `, though every level from ${plateau.low}% to ${plateau.high}% is within the sampling error of that peak.`
              : ".")
          : "") +
        (currentPoint
          ? ` Today's ${currentPoint.coverage}% coverage returns ${currencyFull(currentPoint.netBenefit)}.`
          : ""),
      table: {
        caption: "Net benefit at each coverage level, with sampling error",
        head: ["Control coverage", "Loss avoided", "Control cost", "Net benefit", "Sampling error (±)", "Within the peak band"],
        rows: curve.map((p) => [
          `${p.coverage}%`,
          currencyFull(p.riskAvoided),
          currencyFull(p.cost),
          currencyFull(p.netBenefit),
          currencyFull(p.netBenefitSe),
          plateau && p.coverage >= plateau.low && p.coverage <= plateau.high ? "yes" : "no",
        ]),
      },
    };
  }, [curve, optimalPoint, currentCoveragePct, currentPoint, plateau]);

  const exceedanceChart = useMemo<ChartSpec | null>(() => {
    if (curve.length === 0 || !toleranceSet) return null;
    // Between entering a tolerance and the debounced sweep finishing, `curve`
    // still holds the previous run — whose pExceedTolerance is all null.
    // Rendering that draws an empty chart with just the appetite line, which
    // looks broken. Wait for real data instead.
    if (curve.every((p) => p.pExceedTolerance === null)) return null;
    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels: curve.map((p) => `${p.coverage}%`),
        datasets: [
          {
            label: "P(annual loss > tolerance)",
            data: curve.map((p) => (p.pExceedTolerance === null ? null : p.pExceedTolerance * 100)),
            borderColor: "#ff453a",
            backgroundColor: "rgba(255,69,58,0.20)",
            pointBackgroundColor: curve.map((p) => (p.coverage === currentCoveragePct ? "#ff9f0a" : "#ff453a")),
            pointRadius: curve.map((p) => (p.coverage === currentCoveragePct ? 6 : 3)),
            tension: 0.25,
            fill: true,
          },
          {
            label: `Risk-appetite bar (${(TARGET_EXCEED_PROBABILITY * 100).toFixed(0)}%)`,
            data: curve.map(() => TARGET_EXCEED_PROBABILITY * 100),
            borderColor: "#30d158",
            borderDash: [6, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Control coverage" }, grid: { display: false }, ticks: { color: "#98989d" } },
          y: {
            beginAtZero: true,
            ticks: { color: "#98989d", callback: (v: any) => `${Number(v).toFixed(0)}%` },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
        plugins: { legend: { labels: { color: "#d1d1d6" } } },
      },
    };
    const bar = (TARGET_EXCEED_PROBABILITY * 100).toFixed(0);
    const firstGreen = curve.find((p) => withinTolerance(p.pExceedTolerance)) ?? null;
    return {
      config,
      summary:
        `Probability that annual loss exceeds the stated risk tolerance, at each control coverage level, ` +
        `against a ${bar}% risk-appetite bar. ` +
        (firstGreen
          ? `${firstGreen.coverage}% coverage is the first level that comes in under the bar, at ${pctLabel(firstGreen.pExceedTolerance)}.`
          : `No coverage level in this sweep comes in under the bar — the lowest is ${pctLabel(
              curve.reduce<number | null>(
                (lowest, p) =>
                  p.pExceedTolerance === null ? lowest : lowest === null || p.pExceedTolerance < lowest ? p.pExceedTolerance : lowest,
                null
              )
            )}.`),
      table: {
        caption: `Probability of exceeding the risk tolerance at each coverage level, against a ${bar}% appetite bar`,
        head: ["Control coverage", "P(loss > tolerance)", `Under the ${bar}% bar`],
        rows: curve.map((p) => [
          `${p.coverage}%`,
          pctLabel(p.pExceedTolerance),
          p.pExceedTolerance === null ? "not computed" : withinTolerance(p.pExceedTolerance) ? "yes" : "no",
        ]),
      },
    };
  }, [curve, currentCoveragePct, toleranceSet]);

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
          <SelectDropdown
            label="Scenario"
            options={scenarios.map((s) => ({ id: s.id, label: s.name }))}
            value={scenarioId}
            onChange={setScenarioId}
          />
          <MultiSelectDropdown
            label="Threats in scope"
            placeholder="Baseline"
            itemNoun="threats"
            options={threats.map((t) => ({ id: t.id, label: t.name }))}
            selected={threatIds}
            onChange={setThreatIds}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Risk tolerance (USD/year) · optional</span>
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
            <span className="text-xs font-medium text-slate-400">
              Annual cost to reach 100% coverage (USD){" "}
              <span className="text-amber-400 font-semibold">· required</span>
            </span>
            <input
              className={`select ${costAt100 === "" ? "border-amber-400/60" : ""}`}
              type="number"
              min={0}
              value={costAt100}
              onChange={(e) => setCostAt100(e.target.value)}
              placeholder="e.g. 400000"
              aria-describedby="cost-required-note"
            />
          </label>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Cost is modeled as scaling with the square of coverage — cheap early wins, disproportionately expensive to
          close the last gap — not a sourced budget curve. Enter what full (100%) remediation would realistically cost.
        </p>
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={() => {
              // Re-read today's actual coverage too — it changes whenever
              // someone overrides a control on Control Posture.
              fetch("/api/scenarios", { cache: "no-store" })
                .then((r) => r.json())
                .then((data) => {
                  const rows = (data.controls ?? []) as ControlRow[];
                  if (rows.length > 0) {
                    setCurrentCoveragePct(
                      Math.round(rows.reduce((sum, c) => sum + (c.coveragePct ?? 0), 0) / rows.length)
                    );
                  }
                })
                .catch(() => {});
              setSweepSeed(newSeed());
              setRefreshNonce((n) => n + 1);
            }}
            disabled={loading || !scenarioId}
            className="btn-primary"
          >
            {loading ? "Recalculating…" : "Recalculate"}
          </button>
          {loading && <span className="text-xs text-slate-500">Running {coverageSteps.length} simulations…</span>}
        </div>
      </div>

      {costAt100 === "" && (
        <div
          id="cost-required-note"
          className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 mb-6 text-sm"
        >
          <span className="font-semibold text-amber-400">No cost entered — the ROI analysis has not run. </span>
          <span className="text-slate-300">
            Risk tolerance is optional and only drives the exceedance view below. Return on investment needs a cost
            figure.{" "}
            {maxAvoidable !== null
              ? `Controls can remove at most ${currencyFull(
                  maxAvoidable
                )}/year of loss in this scenario, so a credible remediation budget sits below that.`
              : ""}
          </span>
          {maxAvoidable !== null && maxAvoidable > 0 && (
            <button
              type="button"
              onClick={() => setCostAt100(String(Math.round(maxAvoidable * 0.25)))}
              className="ml-2 text-xs px-2.5 py-1 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10"
            >
              Start at {currencyFull(maxAvoidable * 0.25)}
            </button>
          )}
        </div>
      )}

      {toleranceSet && ceilingExceedance !== null && (
        <div
          className={`rounded-xl border p-4 mb-6 text-sm ${
            toleranceUnreachable ? "border-risk/50 bg-risk/10 text-risk" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          <span className="font-semibold">
            {toleranceUnreachable ? "Tolerance not reachable through controls alone. " : "Tolerance reachable. "}
          </span>
          <span className="text-slate-300">
            {toleranceUnreachable
              ? `Even at 100% control coverage, annual loss still exceeds your ${currencyFull(
                  Number(riskTolerance)
                )} tolerance ${pctLabel(ceilingExceedance)} of the time — well above the ${(
                  TARGET_EXCEED_PROBABILITY * 100
                ).toFixed(0)}% bar. No amount of control spend closes this gap; it takes a higher tolerance, risk transfer (insurance), or exiting the exposure.`
              : `At 100% control coverage, loss exceeds your ${currencyFull(Number(riskTolerance))} tolerance only ${pctLabel(
                  ceilingExceedance
                )} of the time — inside the ${(TARGET_EXCEED_PROBABILITY * 100).toFixed(0)}% bar.`}
          </span>
          {!toleranceUnreachable && minGreenCoverage !== null && (
            <div className="mt-2 text-slate-300">
              {currentCoveragePct !== null && minGreenCoverage > currentCoveragePct ? (
                <>
                  <span className="text-slate-400">But not yet: </span>
                  you need roughly{" "}
                  <span className="font-mono font-semibold text-slate-100">{minGreenCoverage}%</span> coverage to get
                  inside the bar, and you are at{" "}
                  <span className="font-mono font-semibold text-amber-400">{currentCoveragePct}%</span> today — which is
                  why the panel below is red.
                </>
              ) : (
                <>
                  <span className="text-slate-400">Already there: </span>
                  <span className="font-mono font-semibold text-emerald-400">{minGreenCoverage}%</span> coverage is
                  enough, and today&apos;s posture clears it.
                </>
              )}
            </div>
          )}
          {toleranceUnreachable && requiredTolerance !== null && (
            <div className="mt-3 pt-3 border-t border-white/10 text-slate-300">
              <span className="text-slate-400">Tolerance that would be green at 100% coverage: </span>
              <span className="font-mono font-semibold text-slate-100">{currencyFull(requiredTolerance)}/year</span>
              <button
                type="button"
                onClick={() => setRiskTolerance(String(Math.ceil(requiredTolerance)))}
                className="ml-3 text-xs px-2.5 py-1 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10"
              >
                Use this
              </button>
            </div>
          )}
        </div>
      )}

      {currentPoint && costAt100 && (
        <div
          className={`rounded-xl border p-5 mb-6 ${
            toleranceSet
              ? withinTolerance(currentPoint.pExceedTolerance)
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-risk/40 bg-risk/5"
              : "border-accent/40 bg-accent/5"
          }`}
        >
          <div className="text-xs font-medium text-slate-400 mb-1">Where you stand today (actual coverage)</div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-xl font-mono font-semibold text-slate-100">{currentPoint.coverage}% control coverage</span>
            {toleranceSet && (
              <span className="text-sm text-slate-400">
                P(loss &gt; tolerance):{" "}
                <span
                  className={`font-mono font-semibold ${
                    withinTolerance(currentPoint.pExceedTolerance) ? "text-emerald-400" : "text-risk"
                  }`}
                >
                  {pctLabel(currentPoint.pExceedTolerance)}
                </span>{" "}
                <StatusBadge status={withinTolerance(currentPoint.pExceedTolerance) ? "pass" : "fail"}>
                  {withinTolerance(currentPoint.pExceedTolerance) ? "Within appetite" : "Above appetite"}
                </StatusBadge>
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-2">
            At today&apos;s real coverage, net benefit is {currencyFull(currentPoint.netBenefit)}/year.{" "}
            {!optimalPoint || optimalPoint.coverage === currentPoint.coverage
              ? `That's already the model's optimum for this cost estimate.`
              : optimalPoint.coverage > currentPoint.coverage
              ? `Closing the gap to the ${optimalPoint.coverage}% optimum would add another ${currencyFull(
                  optimalPoint.netBenefit - currentPoint.netBenefit
                )}/year in net benefit.`
              : withinPlateau(currentPoint.coverage)
              ? `Today's coverage is inside the statistical plateau (${plateau?.low}–${plateau?.high}%), so the model cannot distinguish it from the optimum. There is no measurable case for changing coverage either way at this cost estimate.`
              : `At the cost you entered, the model puts the best return BELOW today's coverage (${optimalPoint.coverage}%) — by ${currencyFull(
                  optimalPoint.netBenefit - currentPoint.netBenefit
                )}/year, which is outside the sampling noise. Treat that as a flag on the cost estimate, not as advice to remove controls: "spend less on security" needs a far higher evidential bar than "spend more", stripping out controls you already run is rarely the real answer, and coverage you have already paid for is a sunk cost this model does not know about.`}
          </p>
        </div>
      )}

      {optimalPoint && costAt100 && (
        <div
          className={`rounded-xl border p-5 mb-6 ${
            toleranceSet && !withinTolerance(optimalPoint.pExceedTolerance)
              ? "border-risk/40 bg-risk/5"
              : optimalPoint.netBenefit >= 0
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-risk/40 bg-risk/5"
          }`}
        >
          <div className="text-xs font-medium text-slate-400 mb-1">
            Optimal investment point{toleranceSet && !withinTolerance(optimalPoint.pExceedTolerance) ? " (best ROI — still outside risk appetite)" : ""}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-xl font-mono font-semibold text-slate-100">
              {plateau && !plateau.isPoint
                ? `${plateau.low}–${plateau.high}% control coverage`
                : `${optimalPoint.coverage}% control coverage`}
            </span>
            {toleranceSet && (
              <span className="text-sm text-slate-400">
                P(loss &gt; tolerance):{" "}
                <span
                  className={`font-mono font-semibold ${
                    withinTolerance(optimalPoint.pExceedTolerance) ? "text-emerald-400" : "text-risk"
                  }`}
                >
                  {pctLabel(optimalPoint.pExceedTolerance)}
                </span>{" "}
                <StatusBadge status={withinTolerance(optimalPoint.pExceedTolerance) ? "pass" : "fail"}>
                  {withinTolerance(optimalPoint.pExceedTolerance) ? "Within appetite" : "Above appetite"}
                </StatusBadge>
              </span>
            )}
          </div>
          {plateau && !plateau.isPoint && (
            <p className="text-sm text-slate-400 mt-2">
              Net benefit peaks at {currencyFull(optimalPoint.netBenefit)} ± {currencyFull(optimalPoint.netBenefitSe)}
              /year. Every level between{" "}
              <span className="font-mono text-slate-200">
                {plateau.low}% and {plateau.high}%
              </span>{" "}
              is within one standard error of that peak — they are statistically indistinguishable, so choose inside
              the band on operational grounds, not on this number.
            </p>
          )}
          <p className="text-sm text-slate-400 mt-2">
            Net benefit peaks here at {currencyFull(optimalPoint.netBenefit)}/year — {currencyFull(optimalPoint.riskAvoided)}{" "}
            in avoided loss against {currencyFull(optimalPoint.cost)} in control spend
            {optimalPoint.benefitCostRatio !== null
              ? ` (${optimalPoint.benefitCostRatio.toFixed(1)}x return — $${optimalPoint.benefitCostRatio.toFixed(
                  2
                )} avoided per $1 spent)`
              : ""}
            .{" "}
            {optimalPoint.coverage === 0
              ? `That is the model saying no control investment pays for itself at this cost estimate. The entire avoidable loss for this scenario is ${
                  maxAvoidable !== null ? currencyFull(maxAvoidable) : "—"
                }/year, against ${currencyFull(
                  Number(costAt100)
                )} to reach full coverage — so every coverage level destroys value, and "spend nothing" wins by default. That is almost always a sign the cost figure is too high for this scenario rather than a genuine recommendation; a realistic estimate sits below the avoidable-loss figure.`
              : optimalPoint.coverage < 100
              ? `Pushing coverage past this point costs more than the risk it removes — the classic diminishing-returns curve behind every "how much security is enough" conversation.`
              : `At this cost, full coverage still returns more than it spends at every step — this control investment dominates the risk regardless of how far you push it. To see an interior trade-off point instead of a corner solution, try a higher cost estimate (roughly ${currencyFull(
                  optimalPoint.riskAvoided * 0.6
                )}+) — that's the range where the model starts weighing cost against risk instead of one obviously winning.`}
          </p>
        </div>
      )}

      {compliancePremium && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5 mb-6">
          <div className="text-xs font-medium text-slate-400 mb-1">Cost of compliance, above the economic optimum</div>
          <div className="text-xl font-mono font-semibold text-slate-100">
            {optimalPoint?.coverage}% &rarr; {compliancePremium.coverage}% coverage
          </div>
          <p className="text-sm text-slate-400 mt-2">
            These are two different questions and they have two different answers. Net benefit peaks at{" "}
            <span className="text-slate-200">{optimalPoint?.coverage}%</span> — that is where control spend stops
            paying for itself. Your stated appetite needs{" "}
            <span className="text-slate-200">{compliancePremium.coverage}%</span>. Going the extra distance costs{" "}
            <span className="font-mono text-amber-400">{currencyFull(compliancePremium.forgone)}/year</span> in
            forgone net benefit — that is the price of the appetite itself, not a failure of the investment case. It is
            a legitimate number to take to a board: either fund it, or revisit the appetite.
          </p>
        </div>
      )}

      {exceedanceChart && (
        <div className="rounded-xl border border-border bg-surface p-5 mb-6">
          <h3 className="font-semibold text-slate-100 mb-1">Probability of exceeding risk tolerance, by coverage level</h3>
          <p className="text-xs text-slate-500 mb-3">
            The question the board actually asks: at what coverage do we get inside our stated appetite? Where the red
            curve stays above the green line, no level of control investment gets you there. Amber point is today.
          </p>
          <div className={`h-72 transition-opacity ${loading ? "opacity-40" : "opacity-100"}`}>
            <ChartCanvas {...exceedanceChart} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="font-semibold text-slate-100 mb-1">Loss vs. cost, by coverage level</h3>
          <p className="text-xs text-slate-500 mb-3">
            Where the two lines cross is where further spend stops being worth it. The amber point marks today&apos;s
            actual coverage.
          </p>
          <div className={`h-72 transition-opacity ${loading ? "opacity-40" : "opacity-100"}`}>
            {lossVsCostChart ? <ChartCanvas {...lossVsCostChart} /> : <p className="text-sm text-slate-500">{loading ? "Simulating…" : "Pick a scenario to begin."}</p>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="font-semibold text-slate-100 mb-1">Net benefit by coverage level</h3>
          <p className="text-xs text-slate-500 mb-3">
            Green bar is the optimum; amber is today&apos;s actual coverage (if different).
          </p>
          <div className={`h-72 transition-opacity ${loading ? "opacity-40" : "opacity-100"}`}>
            {netBenefitChart ? <ChartCanvas {...netBenefitChart} /> : <p className="text-sm text-slate-500">{loading ? "Simulating…" : "Pick a scenario to begin."}</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
