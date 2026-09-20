"use client";

// Risk TRANSFER — the third FAIR lever, next to mitigate (Control Posture)
// and accept (risk tolerance). The Risk Simulator and ROI pages can tell you
// "controls alone cannot get you inside your appetite" and then leave you
// there. This page answers the question that follows: what does buying the
// tail cost, and does it actually get you green?
//
// No extra simulation: an excess-of-loss layer can be priced straight off the
// Loss Exceedance Curve the Monte Carlo run already produces.
import { useEffect, useMemo, useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { AppShell } from "@/components/AppShell";
import { ChartCanvas } from "@/components/ChartCanvas";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { SelectDropdown } from "@/components/SelectDropdown";
import { interpolateLec, type LecPoint } from "@/lib/lec";
import { expectedRecovery, retainedExceedProbability, indicativePremium, totalCostOfRisk } from "@/lib/insurance";

interface Scenario { id: string; name: string }
interface Threat { id: string; name: string }
interface ControlRow { coveragePct: number }
interface SimResult {
  meanAle: number;
  lec: LecPoint[];
  pExceedTolerance: number | null;
}

const TARGET_EXCEED_PROBABILITY = 0.1;

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
const currencyFull = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const pct = (p: number | null) => (p === null ? "—" : `${(p * 100).toFixed(2)}%`);

export default function TransferPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [threatIds, setThreatIds] = useState<string[]>([]);
  const [coveragePct, setCoveragePct] = useState<number>(0);
  const [tolerance, setTolerance] = useState("");
  const [attachment, setAttachment] = useState("");
  const [limit, setLimit] = useState("");
  const [premiumInput, setPremiumInput] = useState("");
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scenarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setScenarios(data.scenarios);
        setThreats(data.threats);
        setScenarioId(data.scenarios[0]?.id ?? "");
        const rows = (data.controls ?? []) as ControlRow[];
        if (rows.length > 0) {
          setCoveragePct(Math.round(rows.reduce((s, c) => s + (c.coveragePct ?? 0), 0) / rows.length));
        }
      })
      .catch(() => setLoadError("Failed to load scenarios"));
  }, []);

  // Same staleness trap as the ROI page: coverage is edited elsewhere.
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible") return;
      fetch("/api/scenarios", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          const rows = (data.controls ?? []) as ControlRow[];
          if (rows.length > 0) setCoveragePct(Math.round(rows.reduce((s, c) => s + (c.coveragePct ?? 0), 0) / rows.length));
        })
        .catch(() => {});
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const toleranceValue = tolerance ? Number(tolerance) : null;

  useEffect(() => {
    if (!scenarioId) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/risk/whatif", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId, threatIds, riskTolerance: toleranceValue, coveragePct }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Simulation failed");
        setResult(data.result as SimResult);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Simulation failed");
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [scenarioId, threatIds, coveragePct, toleranceValue]);

  const layer = useMemo(
    () => ({ attachment: attachment ? Number(attachment) : 0, limit: limit ? Number(limit) : 0 }),
    [attachment, limit]
  );
  const layerSet = layer.limit > 0;

  const recovery = useMemo(
    () => (result && layerSet ? expectedRecovery(result.lec, layer) : 0),
    [result, layer, layerSet]
  );
  const premium = premiumInput ? Number(premiumInput) : indicativePremium(recovery);
  const retainedLoss = result ? Math.max(result.meanAle - recovery, 0) : 0;
  const grossExceed = result?.pExceedTolerance ?? null;
  const netExceed = useMemo(
    () => (result && toleranceValue !== null && layerSet ? retainedExceedProbability(result.lec, toleranceValue, layer) : grossExceed),
    [result, toleranceValue, layer, layerSet, grossExceed]
  );
  const grossGreen = grossExceed !== null && grossExceed <= TARGET_EXCEED_PROBABILITY;
  const netGreen = netExceed !== null && netExceed <= TARGET_EXCEED_PROBABILITY;
  const transferCloses = !grossGreen && netGreen;

  // Retained-loss exceedance: below the retention you carry the loss yourself,
  // so the curve is unchanged; above it the layer pins your loss at the
  // attachment until the policy is exhausted, so the curve jumps to where the
  // gross curve sits a full limit further out.
  const chartConfig: ChartConfiguration<"line"> | null = useMemo(() => {
    if (!result || result.lec.length === 0) return null;
    const xs = result.lec.map((p) => p.loss);
    return {
      type: "line",
      data: {
        labels: xs.map((x) => currency(x)),
        datasets: [
          {
            label: "Gross loss (uninsured)",
            data: result.lec.map((p) => p.probability * 100),
            borderColor: "#ff453a",
            backgroundColor: "rgba(255,69,58,0.18)",
            pointRadius: 0,
            tension: 0.2,
            fill: true,
          },
          ...(layerSet
            ? [
                {
                  label: "Retained loss (after transfer)",
                  data: xs.map((x) => {
                    const p = x < layer.attachment ? interpolateLec(result.lec, x) : interpolateLec(result.lec, x + layer.limit);
                    return p === null ? null : p * 100;
                  }),
                  borderColor: "#64d2ff",
                  backgroundColor: "rgba(100,210,255,0.16)",
                  pointRadius: 0,
                  tension: 0.2,
                  fill: true,
                },
              ]
            : []),
          {
            label: `Risk-appetite bar (${(TARGET_EXCEED_PROBABILITY * 100).toFixed(0)}%)`,
            data: xs.map(() => TARGET_EXCEED_PROBABILITY * 100),
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
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { title: { display: true, text: "Annual loss" }, grid: { display: false }, ticks: { color: "#98989d", maxTicksLimit: 8 } },
          y: {
            beginAtZero: true,
            title: { display: true, text: "P(loss > x)" },
            ticks: { color: "#98989d", callback: (v: any) => `${Number(v).toFixed(0)}%` },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
        plugins: { legend: { labels: { color: "#d1d1d6" } } },
      },
    };
  }, [result, layer, layerSet]);

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Risk Transfer</h1>
        <p className="text-slate-400 mt-1">
          Controls reduce risk; insurance moves what is left. Price a cyber layer straight off the loss exceedance
          curve — no extra simulation required.
        </p>
      </header>

      {loadError && <div className="mb-6 rounded-lg border border-risk/30 bg-risk/10 text-risk px-4 py-3 text-sm">{loadError}</div>}

      <div className="rounded-xl border border-border bg-surface p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            <span className="text-xs font-medium text-slate-400">
              Risk tolerance (USD/year) <span className="text-amber-400 font-semibold">· required</span>
            </span>
            <input
              className={`select ${tolerance === "" ? "border-amber-400/60" : ""}`}
              type="number"
              min={0}
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              placeholder="e.g. 5000000"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Retention / attachment point (USD)</span>
            <input className="select" type="number" min={0} value={attachment} onChange={(e) => setAttachment(e.target.value)} placeholder="e.g. 1000000" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Policy limit (USD)</span>
            <input className="select" type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="e.g. 10000000" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Annual premium (USD, blank = indicative)</span>
            <input
              className="select"
              type="number"
              min={0}
              value={premiumInput}
              onChange={(e) => setPremiumInput(e.target.value)}
              placeholder={recovery > 0 ? currencyFull(indicativePremium(recovery)) : "e.g. 250000"}
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="text-xs font-medium text-slate-400 block mb-1.5">
            Control coverage assumed: <span className="font-mono text-slate-200">{coveragePct}%</span>
          </span>
          <input type="range" min={0} max={100} value={coveragePct} onChange={(e) => setCoveragePct(Number(e.target.value))} className="w-full" aria-label="Assumed control coverage" />
        </div>

        <p className="text-[11px] text-slate-500 mt-3">
          Modelled as an excess-of-loss layer: you keep everything up to the retention, the policy pays the next slice
          up to its limit, and anything above that comes back to you. The indicative premium is the expected payout
          loaded 1.4x for the insurer&apos;s capital and expenses — a demo assumption, not a quote.
          {loading && <span className="text-slate-400"> · Simulating…</span>}
        </p>
      </div>

      {result && toleranceValue !== null && layerSet && (
        <div
          className={`rounded-xl border p-5 mb-6 ${
            transferCloses ? "border-emerald-500/50 bg-emerald-500/10" : netGreen ? "border-emerald-500/40 bg-emerald-500/5" : "border-risk/40 bg-risk/5"
          }`}
        >
          <div className="text-xs font-medium text-slate-400 mb-2">P(loss &gt; tolerance)</div>
          <div className="flex items-center gap-4 flex-wrap">
            <span className={`font-mono text-2xl font-semibold ${grossGreen ? "text-emerald-400" : "text-risk"}`}>
              {pct(grossExceed)}
            </span>
            <span className="text-slate-500 text-xl">&rarr;</span>
            <span className={`font-mono text-2xl font-semibold ${netGreen ? "text-emerald-400" : "text-risk"}`}>{pct(netExceed)}</span>
            <span className="text-xs text-slate-500">uninsured &rarr; after transfer</span>
          </div>
          <p className="text-sm text-slate-400 mt-3">
            {transferCloses
              ? `Transfer closes the gap. A ${currencyFull(layer.limit)} limit above a ${currencyFull(
                  layer.attachment
                )} retention takes this scenario from ${pct(grossExceed)} to ${pct(
                  netExceed
                )} — inside the ${(TARGET_EXCEED_PROBABILITY * 100).toFixed(0)}% bar — for an indicative ${currencyFull(
                  premium
                )}/year. That is the option a control budget alone cannot buy.`
              : netGreen
              ? `Already inside the bar before transfer; this layer mainly smooths volatility rather than closing a compliance gap.`
              : `This layer is not enough on its own: ${pct(
                  netExceed
                )} still breaches the bar. Either the retention sits above your tolerance (so the policy never engages at that threshold), or the limit is exhausted too often — raise the limit, lower the retention, or pair it with more control coverage.`}
          </p>
        </div>
      )}

      {result && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Expected annual recovery</div>
            <div className="text-lg font-mono font-semibold text-slate-100">{currencyFull(recovery)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Premium {premiumInput ? "(entered)" : "(indicative)"}</div>
            <div className="text-lg font-mono font-semibold text-slate-100">{currencyFull(premium)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Retained expected loss</div>
            <div className="text-lg font-mono font-semibold text-slate-100">{currencyFull(retainedLoss)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Total cost of risk</div>
            <div className="text-lg font-mono font-semibold text-slate-100">
              {currencyFull(totalCostOfRisk(0, layerSet ? premium : 0, retainedLoss))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">premium + retained loss</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="font-semibold text-slate-100 mb-1">Where the policy actually bites</h3>
        <p className="text-xs text-slate-500 mb-3">
          Below the retention the two curves sit on top of each other — you carry that loss either way. Above it the
          blue curve collapses: the layer absorbs the tail until the limit runs out.
        </p>
        <div className={`h-80 transition-opacity ${loading ? "opacity-40" : "opacity-100"}`}>
          {chartConfig ? <ChartCanvas config={chartConfig} /> : <p className="text-sm text-slate-500">Pick a scenario to begin.</p>}
        </div>
      </div>
    </AppShell>
  );
}
