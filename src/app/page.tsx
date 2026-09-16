"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { fmtUsd, fmtUsdShort, quantile } from "@/lib/format";
import type { ScenarioPayload, RunResult, SensitivityRow } from "@/lib/types";

const N_MAIN = 8000;

type TabKey = "lec" | "hist" | "tornado";

export default function Page() {
  const [scenarios, setScenarios] = useState<ScenarioPayload[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityRow[] | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("lec");
  const [running, setRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenario = useMemo(
    () => scenarios?.find((s) => s.key === selectedKey) ?? null,
    [scenarios, selectedKey]
  );

  const runSimulation = useCallback(async (key: string, includeSensitivity = false) => {
    setRunning(true);
    try {
      const res = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: key, includeSensitivity }),
      });
      const data: RunResult = await res.json();
      setResult(data);
      if (data.sensitivity) setSensitivity(data.sensitivity);
    } finally {
      setRunning(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data: ScenarioPayload[]) => {
        setScenarios(data);
        if (data.length > 0) {
          setSelectedKey(data[0].key);
          runSimulation(data[0].key);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScenarioChange(key: string) {
    setSelectedKey(key);
    setSensitivity(null);
    setActiveTab("lec");
    runSimulation(key);
  }

  function scheduleRecompute(key: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSensitivity(null);
      runSimulation(key);
    }, 250);
  }

  async function onSliderChange(controlKey: string, value: number) {
    if (!scenario) return;
    // Optimistic local update so the slider feels immediate.
    setScenarios(
      (prev) =>
        prev?.map((s) =>
          s.key !== scenario.key
            ? s
            : {
                ...s,
                controls: s.controls.map((c) =>
                  c.key === controlKey ? { ...c, coveragePct: value, source: "manual" } : c
                ),
              }
        ) ?? null
    );
    scheduleRecompute(scenario.key);

    await fetch("/api/controls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: scenario.key, control: controlKey, coveragePct: value }),
    });
  }

  async function onSyncAws() {
    if (!scenario) return;
    setSyncing(true);
    setSyncNote(null);
    try {
      const res = await fetch("/api/integrations/aws-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenario.key }),
      });
      const data = await res.json();
      setSyncNote(data.note ?? null);
      // Refresh scenario list to pick up new coverage + source labels.
      const refreshed: ScenarioPayload[] = await fetch("/api/scenarios").then((r) => r.json());
      setScenarios(refreshed);
      setSensitivity(null);
      runSimulation(scenario.key);
    } finally {
      setSyncing(false);
    }
  }

  function onTabClick(tab: TabKey) {
    setActiveTab(tab);
    if (tab === "tornado" && !sensitivity && scenario) {
      runSimulation(scenario.key, true);
    }
  }

  const coveragePct = scenario
    ? Math.round(
        (scenario.controls.reduce((sum, c) => sum + (c.coveragePct / 100) * c.weight, 0)) * 100
      )
    : 0;

  return (
    <div className="wrap">
      <header className="top">
        <div className="top-row">
          <div className="brand">
            <h1>FAIR Risk Radar</h1>
            <p>
              An annual-loss model for a cyber breach scenario, quantified with the Open Group&apos;s
              FAIR ontology, run as a server-side Monte Carlo simulation backed by Postgres — every run
              is persisted as an audit trail, and control coverage can sync live from AWS Config.
            </p>
            <span className="method-tag">
              Engine: <b>Monte Carlo</b> · {N_MAIN.toLocaleString()} trials · Postgres-backed
            </span>
          </div>
          <div className="header-actions">
            <div>
              <label className="select-label" htmlFor="industry">
                Industry loss profile
              </label>
              <select
                id="industry"
                className="ind-select"
                value={selectedKey}
                onChange={(e) => onScenarioChange(e.target.value)}
              >
                {scenarios?.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {scenario && (
              <div className="btn-row">
                <button className="btn" onClick={onSyncAws} disabled={syncing}>
                  {syncing ? "Syncing…" : "Sync from AWS Config"}
                </button>
                <a className="btn" href={`/api/reports/export?scenario=${scenario.key}&format=csv`}>
                  Export CSV
                </a>
                <a className="btn primary" href={`/api/reports/export?scenario=${scenario.key}&format=pdf`}>
                  Export PDF
                </a>
              </div>
            )}
          </div>
        </div>
        {syncNote && <p className="loading-note" style={{ marginTop: 10 }}>{syncNote}</p>}
      </header>

      {!scenario || !result ? (
        <p className="loading-note" style={{ marginTop: 20 }}>
          Loading scenarios…
        </p>
      ) : (
        <>
          <section className="kpis">
            <div className="kpi">
              <p className="lbl">Expected annual loss</p>
              <p className="val">{fmtUsd(result.assessment.expectedAnnualLoss)}</p>
              <p className="sub">mean of {result.assessment.trials.toLocaleString()} simulated years</p>
            </div>
            <div className="kpi">
              <p className="lbl">Value at risk — P95</p>
              <p className="val">{fmtUsd(result.assessment.p95)}</p>
              <p className="sub">1-in-20-year annual loss</p>
            </div>
            <div className="kpi">
              <p className="lbl">Value at risk — P99</p>
              <p className="val">{fmtUsd(result.assessment.p99)}</p>
              <p className="sub">1-in-100-year annual loss</p>
            </div>
            <div className="kpi">
              <p className="lbl">Loss event frequency</p>
              <p className="val">{result.assessment.lossEventFrequency.toFixed(2)}</p>
              <p className="sub">expected loss events / year</p>
            </div>
          </section>

          <div className="grid">
            <div className="card">
              <div className="card-hd">
                <h2>Risk factors</h2>
              </div>
              <div className="card-bd">
                <div className="tree">
                  <b>Loss Event Frequency</b> = Threat Event Frequency <span className="op">×</span>{" "}
                  Vulnerability
                  <br />
                  <b>Loss Magnitude</b> = Primary Loss <span className="op">+</span> (Secondary Loss
                  Probability <span className="op">×</span> Secondary Loss Magnitude)
                </div>

                <FactorRow label="Threat event frequency" badge="modeled" tri={scenario.tef} fmt={(x) => x.toFixed(0) + "/yr"} />
                <FactorRow label="Vulnerability (baseline)" badge="modeled" tri={scenario.vulnBaseline} fmt={(x) => (x * 100).toFixed(0) + "%"} />
                <FactorRow label="Primary loss magnitude" badge="sourced" tri={scenario.lossPrimary} fmt={fmtUsdShort} />
                <FactorRow label="Secondary loss magnitude" badge="sourced" tri={scenario.lossSecondary} fmt={fmtUsdShort} />
                <FactorRow label="Secondary loss probability" badge="modeled" tri={scenario.secProb} fmt={(x) => (x * 100).toFixed(0) + "%"} />

                <h3 style={{ fontSize: 12.5, margin: "20px 0 2px", fontWeight: 600 }}>Control coverage</h3>
                <p className="slider-hint" style={{ marginTop: 2 }}>
                  Controls act on <b>Vulnerability</b>. Drag manually, or sync from AWS Config above.
                </p>
                <div className="sliders">
                  {scenario.controls.map((c) => (
                    <div className="slider-row" key={c.key}>
                      <div className="slider-top">
                        <span>{c.name}</span>
                        <span className="v">{Math.round(c.coveragePct)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={c.coveragePct}
                        onChange={(e) => onSliderChange(c.key, Number(e.target.value))}
                        aria-label={`${c.name} coverage`}
                      />
                      <p className="slider-hint">
                        {c.description}{" "}
                        <span className={`badge ${c.source === "aws-config" ? "live" : c.source === "demo" ? "demo" : "modeled"}`}>
                          {c.source}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>

                <div className="vuln-readout">
                  <span>Weighted control coverage</span>
                  <span className="v">{coveragePct}%</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-hd">
                <h2>Simulated outcomes</h2>
                <div className="tabs" role="tablist" aria-label="Chart view">
                  {(["lec", "hist", "tornado"] as TabKey[]).map((tab) => (
                    <button
                      key={tab}
                      className="tab-btn"
                      role="tab"
                      aria-selected={activeTab === tab}
                      onClick={() => onTabClick(tab)}
                    >
                      {tab === "lec" ? "Exceedance curve" : tab === "hist" ? "Loss distribution" : "Sensitivity"}
                    </button>
                  ))}
                </div>
              </div>
              <ChartPanel
                tab={activeTab}
                result={result}
                sensitivity={sensitivity}
                running={running}
              />
            </div>
          </div>

          <MethodologyCard scenario={scenario} />

          <footer className="page-footer">
            Figures reflect 2025 industry reporting; treat exact dollar values as illustrative for a
            portfolio demonstration, not a live feed. Every simulation run is persisted — see the{" "}
            <code>RiskAssessment</code> table for the full history.
          </footer>
        </>
      )}
    </div>
  );
}

function FactorRow({
  label,
  badge,
  tri,
  fmt,
}: {
  label: string;
  badge: "sourced" | "modeled";
  tri: { min: number; mode: number; max: number };
  fmt: (x: number) => string;
}) {
  return (
    <div className="factor">
      <div className="factor-hd">
        <span className="name">{label}</span>
        <span className={`badge ${badge}`}>{badge}</span>
      </div>
      <div className="tri-bar">
        <div className="rng" />
        <div
          className="mode"
          style={{ left: `${((tri.mode - tri.min) / (tri.max - tri.min || 1)) * 100}%` }}
        />
      </div>
      <div className="tri-nums">
        <span>{fmt(tri.min)}</span>
        <span>{fmt(tri.mode)}</span>
        <span>{fmt(tri.max)}</span>
      </div>
    </div>
  );
}

function ChartPanel({
  tab,
  result,
  sensitivity,
  running,
}: {
  tab: TabKey;
  result: RunResult;
  sensitivity: SensitivityRow[] | null;
  running: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<any>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!canvasRef.current) return;
    const style = getComputedStyle(document.body);
    const cssVar = (name: string) => style.getPropertyValue(name).trim();

    chartRef.current?.destroy();

    if (tab === "lec") {
      const maxLoss = quantile(result.losses, 0.995) * 1.15 || 1;
      const steps = 40;
      const points = Array.from({ length: steps + 1 }, (_, i) => {
        const x = (maxLoss / steps) * i;
        const exceed = result.losses.filter((v) => v >= x).length / result.losses.length;
        return { x, y: exceed * 100 };
      });
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        data: {
          datasets: [
            {
              label: "P(annual loss ≥ x)",
              data: points,
              borderColor: cssVar("--accent"),
              backgroundColor: cssVar("--accent-soft"),
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 200, easing: "easeOutQuad" },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => "Loss ≥ " + fmtUsd((items[0].parsed as any).x),
                label: (item) => ((item.parsed as any).y as number).toFixed(1) + "% chance this year",
              },
            },
          },
          scales: {
            x: {
              type: "linear",
              min: 0,
              max: maxLoss,
              ticks: { callback: (v) => fmtUsdShort(v as number), color: cssVar("--text-muted") },
              grid: { color: cssVar("--border") },
            },
            y: {
              min: 0,
              max: 100,
              ticks: { callback: (v) => v + "%", color: cssVar("--text-muted") },
              grid: { color: cssVar("--border") },
            },
          },
        },
      });
      setNote(
        `Reads as: the chance of losing at least that amount over the next 12 months. P95 sits at ${fmtUsd(
          result.assessment.p95
        )}, P99 at ${fmtUsd(result.assessment.p99)}.`
      );
    }

    if (tab === "hist") {
      const max = quantile(result.losses, 0.99) * 1.05 || 1;
      const bins = 22;
      const width = max / bins;
      const counts = new Array(bins).fill(0);
      result.losses.forEach((v) => {
        if (v > max) return;
        const idx = Math.min(bins - 1, Math.floor(v / width));
        counts[idx]++;
      });
      const labels = counts.map((_, i) => fmtUsdShort(i * width));
      chartRef.current = new Chart(canvasRef.current, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Simulated years",
              data: counts,
              backgroundColor: cssVar("--accent2-soft"),
              borderColor: cssVar("--accent2"),
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 200, easing: "easeOutQuad" },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (item) => `${(item.parsed as any).y} of ${result.assessment.trials} simulated years` } },
          },
          scales: {
            x: { ticks: { color: cssVar("--text-muted"), maxTicksLimit: 8 }, grid: { display: false } },
            y: { ticks: { color: cssVar("--text-muted") }, grid: { color: cssVar("--border") } },
          },
        },
      });
      setNote(
        `Distribution of ${result.assessment.trials.toLocaleString()} simulated annual-loss totals. Mean (expected annual loss): ${fmtUsd(
          result.assessment.expectedAnnualLoss
        )}.`
      );
    }

    if (tab === "tornado") {
      if (!sensitivity) {
        setNote("Computing sensitivity…");
        return;
      }
      chartRef.current = new Chart(canvasRef.current, {
        type: "bar",
        data: {
          labels: sensitivity.map((r) => r.name),
          datasets: [
            {
              label: "Range of expected annual loss (low → high factor value)",
              data: sensitivity.map((r) => [Math.min(r.low, r.high), Math.max(r.low, r.high)]) as any,
              backgroundColor: cssVar("--accent-soft"),
              borderColor: cssVar("--accent"),
              borderWidth: 1,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 200, easing: "easeOutQuad" },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item) => {
                  const raw = item.raw as [number, number];
                  return `${fmtUsd(raw[0])} – ${fmtUsd(raw[1])}`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { callback: (v) => fmtUsdShort(v as number), color: cssVar("--text-muted") }, grid: { color: cssVar("--border") } },
            y: { ticks: { color: cssVar("--text") }, grid: { display: false } },
          },
        },
      });
      setNote(
        "One-at-a-time sensitivity: each bar holds every other factor at its likely value and swings this one from its low to its high estimate. Widest bar drives the most uncertainty in expected annual loss."
      );
    }

    return () => {
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, result, sensitivity]);

  return (
    <>
      <div className={`chart-box${running ? " loading" : ""}`}>
        <canvas ref={canvasRef} />
      </div>
      <p className="chart-note">{note}</p>
    </>
  );
}

function MethodologyCard({ scenario }: { scenario: ScenarioPayload }) {
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-hd">
        <h2>Methodology &amp; assumptions</h2>
      </div>
      <div className="card-bd">
        <div className="method-grid">
          <div>
            <h3>What&apos;s sourced</h3>
            <p>
              Loss magnitude is calibrated to this industry&apos;s average total cost of a data breach,
              split into primary vs. secondary loss using the global cost-category breakdown — both from{" "}
              <b>{scenario.sourceCitation}</b>.
            </p>
            <ul>
              <li>Industry average total cost (IBM Fig. 3), by profile.</li>
              <li>Global cost-category split: lost business, post-breach response, notification.</li>
              <li>
                Context: ransomware was present in 44% of confirmed breaches in the 2025 Verizon DBIR,
                up from 32% the year before — shown for reference, not built into the magnitude figures.
              </li>
            </ul>
          </div>
          <div>
            <h3>What&apos;s modeled</h3>
            <p>
              Threat Event Frequency and the Vulnerability baseline aren&apos;t published at this
              granularity anywhere, so they&apos;re explicit, editable assumptions rather than disguised
              as data — recalibrate them against your own SIEM/EDR telemetry.
            </p>
            <p>
              Every factor in the left panel carries a <span className="badge sourced">sourced</span> or{" "}
              <span className="badge modeled">modeled</span> tag, and every control&apos;s coverage
              carries its own <span className="badge live">aws-config</span> /{" "}
              <span className="badge modeled">manual</span> / <span className="badge demo">demo</span> source
              tag.
            </p>
          </div>
        </div>
        <div className="method-grid">
          <div>
            <h3>How the simulation runs</h3>
            <p>
              Each of 8,000 trials represents one simulated year, computed server-side and persisted as a{" "}
              <code>RiskAssessment</code> row. Threat Event Frequency and Vulnerability are drawn from
              triangular distributions and multiplied into that year&apos;s Loss Event Frequency; the
              event count is then drawn from a Poisson distribution with that mean. The exceedance curve
              and percentiles are read directly off the resulting simulated totals.
            </p>
          </div>
          <div>
            <h3>Where this simplifies real FAIR practice</h3>
            <p>
              A full FAIR analysis samples from Beta-PERT distributions and separates threat capability
              from control (resistance) strength. This model uses triangular distributions as a lighter
              approximation, and folds three named controls into one Vulnerability multiplier — built to
              show the mechanics clearly, not to replace a calibrated tool for a real engagement.
            </p>
          </div>
        </div>
        <p className="cite">
          Sources: IBM Security,{" "}
          <a href="https://www.ibm.com/think/x-force/2025-cost-of-a-data-breach-navigating-ai" target="_blank" rel="noopener noreferrer">
            Cost of a Data Breach Report 2025
          </a>{" "}
          · Verizon,{" "}
          <a href="https://www.verizon.com/business/resources/reports/2025-dbir-data-breach-investigations-report.pdf" target="_blank" rel="noopener noreferrer">
            2025 Data Breach Investigations Report
          </a>{" "}
          · Framework: The Open Group, FAIR (Factor Analysis of Information Risk).
        </p>
      </div>
    </div>
  );
}
