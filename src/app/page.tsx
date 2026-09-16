"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
} from "react";
import Chart from "chart.js/auto";
import { fmtUsd, fmtUsdShort } from "@/lib/format";
import {
  simulate,
  sensitivity as computeSensitivity,
  exceedanceCurve,
  histogram,
  type FairProfile,
} from "@/lib/fair";
import type { ScenarioPayload, AssessmentPayload, ControlPayload } from "@/lib/types";

type TabKey = "lec" | "hist" | "tornado";
type Theme = "light" | "dark";

/**
 * Dragging a slider runs the model locally so the charts track the input with
 * no network in the loop. The server run (8,000 trials) is reserved for
 * "Run simulation", which is also what writes an immutable assessment row —
 * so the audit trail records deliberate assessments, not every slider twitch.
 */
const PREVIEW_TRIALS = 4000;
const SENSITIVITY_TRIALS = 1200;

const TABS: { key: TabKey; label: string }[] = [
  { key: "lec", label: "Exceedance" },
  { key: "hist", label: "Distribution" },
  { key: "tornado", label: "Sensitivity" },
];

/* ------------------------------ icons ------------------------------ */

function Icon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15",
  cloud: "M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
  play: "M5 3l14 9-14 9V3z",
  check: "M20 6L9 17l-5-5",
};

/* ------------------------------ helpers ------------------------------ */

function profileOf(s: ScenarioPayload): FairProfile {
  return {
    tef: s.tef,
    vulnBaseline: s.vulnBaseline,
    secProb: s.secProb,
    lossPrimary: s.lossPrimary,
    lossSecondary: s.lossSecondary,
  };
}

function coverageOf(controls: ControlPayload[]): number {
  return controls.reduce((sum, c) => sum + (c.coveragePct / 100) * c.weight, 0);
}

/* ------------------------------ page ------------------------------ */

export default function Page() {
  const [scenarios, setScenarios] = useState<ScenarioPayload[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [recorded, setRecorded] = useState<AssessmentPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("lec");
  const [running, setRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenario = useMemo(
    () => scenarios?.find((s) => s.key === selectedKey) ?? null,
    [scenarios, selectedKey]
  );

  /* ---- live local model ------------------------------------------------ */
  // Deferring the controls lets the slider thumb stay on the fast path while
  // the simulation runs against the slightly-behind value.
  const deferredScenario = useDeferredValue(scenario);
  const isStale = deferredScenario !== scenario;

  const preview = useMemo(() => {
    if (!deferredScenario) return null;
    const result = simulate(
      profileOf(deferredScenario),
      coverageOf(deferredScenario.controls),
      PREVIEW_TRIALS
    );
    // Share of simulated years that blow through the board-approved ceiling.
    // This is the number the tolerance line on the chart is showing.
    const tolerance = deferredScenario.toleranceUsd;
    const breaches = result.losses.filter((v) => v >= tolerance).length;
    return {
      mean: result.mean,
      p95: result.p95,
      p99: result.p99,
      lef: result.lossEventFrequency,
      curve: exceedanceCurve(result.losses),
      bins: histogram(result.losses),
      pOverTolerance: (breaches / result.losses.length) * 100,
      tolerance,
    };
  }, [deferredScenario]);

  const sensitivityRows = useMemo(() => {
    if (activeTab !== "tornado" || !deferredScenario) return null;
    return computeSensitivity(
      profileOf(deferredScenario),
      coverageOf(deferredScenario.controls),
      SENSITIVITY_TRIALS
    );
  }, [activeTab, deferredScenario]);

  /* ---- theme ----------------------------------------------------------- */
  useEffect(() => {
    setTheme((document.documentElement.getAttribute("data-theme") as Theme) || "light");
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("frr-theme", next);
    } catch {
      /* storage blocked — still applies for this session */
    }
  }

  /* ---- data load ------------------------------------------------------- */
  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data: ScenarioPayload[]) => {
        setScenarios(data);
        if (data.length > 0) {
          setSelectedKey(data[0].key);
          setRecorded(data[0].latestAssessment);
        }
      });
  }, []);

  function selectScenario(key: string) {
    if (key === selectedKey) return;
    setSelectedKey(key);
    setRecorded(scenarios?.find((s) => s.key === key)?.latestAssessment ?? null);
    setActiveTab("lec");
    setNotice(null);
  }

  /* ---- interactions ---------------------------------------------------- */
  const onSliderChange = useCallback(
    (controlKey: string, value: number) => {
      if (!scenario) return;
      const scenarioKey = scenario.key;

      setScenarios(
        (prev) =>
          prev?.map((s) =>
            s.key !== scenarioKey
              ? s
              : {
                  ...s,
                  controls: s.controls.map((c) =>
                    c.key === controlKey ? { ...c, coveragePct: value, source: "manual" } : c
                  ),
                }
          ) ?? null
      );

      // Persist coverage in the background — the UI never waits on it.
      if (patchTimer.current) clearTimeout(patchTimer.current);
      patchTimer.current = setTimeout(() => {
        fetch("/api/controls", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: scenarioKey, control: controlKey, coveragePct: value }),
        }).catch(() => {
          setNotice("Couldn't save control coverage — check your connection.");
        });
      }, 500);
    },
    [scenario]
  );

  async function recordAssessment() {
    if (!scenario) return;
    setRunning(true);
    setNotice(null);
    try {
      const res = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenario.key }),
      });
      const data = await res.json();
      setRecorded(data.assessment);
      setScenarios(
        (prev) =>
          prev?.map((s) =>
            s.key === scenario.key ? { ...s, latestAssessment: data.assessment } : s
          ) ?? null
      );
      setNotice(
        `Assessment recorded — ${data.assessment.trials.toLocaleString()} trials written to the register.`
      );
    } catch {
      setNotice("Couldn't record the assessment — check your connection.");
    } finally {
      setRunning(false);
    }
  }

  async function onSyncAws() {
    if (!scenario) return;
    setSyncing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/integrations/aws-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenario.key }),
      });
      const data = await res.json();
      setNotice(data.note ?? null);
      const refreshed: ScenarioPayload[] = await fetch("/api/scenarios").then((r) => r.json());
      setScenarios(refreshed);
    } finally {
      setSyncing(false);
    }
  }

  const weightedCoverage = scenario ? Math.round(coverageOf(scenario.controls) * 100) : 0;
  const overTolerance = scenario && preview ? preview.mean > scenario.toleranceUsd : false;

  return (
    <div className="app">
      {/* ---------------- sidebar ---------------- */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">FR</span>
          <span className="brand-name">Risk Radar</span>
        </div>

        <nav className="nav">
          <div className="nav-group">
            <p className="nav-label">Risk register</p>
            {scenarios?.map((s) => {
              const active = s.key === selectedKey;
              return (
                <button
                  key={s.key}
                  className="nav-item"
                  aria-current={active}
                  onClick={() => selectScenario(s.key)}
                >
                  <span className="nav-item-label">
                    <span
                      className="nav-dot"
                      style={{ background: active ? "var(--accent)" : "var(--border-strong)" }}
                    />
                    {s.label.split(" — ")[0]}
                  </span>
                </button>
              );
            }) ?? <p className="nav-label">Loading…</p>}
          </div>

          <div className="nav-group">
            <p className="nav-label">Reference</p>
            <a className="nav-item" href="#methodology" style={{ textDecoration: "none" }}>
              <span className="nav-item-label">
                <Icon path={ICONS.book} size={13} />
                Methodology
              </span>
            </a>
          </div>
        </nav>

        <div className="sidebar-foot">
          Loss data calibrated to IBM&apos;s 2025 Cost of a Data Breach Report. Frequency and
          vulnerability are modeled assumptions.
        </div>
      </aside>

      {/* ---------------- main ---------------- */}
      <div className="main">
        <header className="topbar">
          <div className="crumb">
            <span className="crumb-hide">Risk register</span>
            <span className="crumb-sep crumb-hide">/</span>
            <strong>{scenario ? scenario.label.split(" — ")[0] : "Loading…"}</strong>
          </div>

          <div className="topbar-actions">
            <button
              className="btn btn-icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              <Icon path={theme === "dark" ? ICONS.sun : ICONS.moon} />
            </button>
            {scenario && (
              <>
                <button className="btn" onClick={onSyncAws} disabled={syncing}>
                  <Icon path={ICONS.cloud} />
                  {syncing ? "Syncing…" : "Sync AWS"}
                </button>
                <a
                  className="btn"
                  href={`/api/reports/export?scenario=${scenario.key}&format=csv`}
                  aria-disabled={!recorded}
                  onClick={(e) => {
                    if (!recorded) {
                      e.preventDefault();
                      setNotice("Record an assessment first — exports read from the register.");
                    }
                  }}
                >
                  <Icon path={ICONS.download} />
                  CSV
                </a>
                <a
                  className="btn"
                  href={`/api/reports/export?scenario=${scenario.key}&format=pdf`}
                  aria-disabled={!recorded}
                  onClick={(e) => {
                    if (!recorded) {
                      e.preventDefault();
                      setNotice("Record an assessment first — exports read from the register.");
                    }
                  }}
                >
                  <Icon path={ICONS.download} />
                  PDF
                </a>
                <button className="btn btn-primary" onClick={recordAssessment} disabled={running}>
                  <Icon path={running ? ICONS.refresh : ICONS.play} />
                  {running ? "Recording…" : "Record assessment"}
                </button>
              </>
            )}
          </div>
        </header>

        <div className="content">
          {!scenario || !preview ? (
            <div className="panel">
              <p className="empty-state">Loading risk register…</p>
            </div>
          ) : (
            <>
              <div className="page-head">
                <h1>{scenario.label.split(" — ")[0]}</h1>
                <p>{scenario.threat}</p>
              </div>

              {notice && (
                <div className="toast">
                  <Icon path={ICONS.check} />
                  {notice}
                </div>
              )}

              <div className="kpi-row">
                <div className="kpi">
                  <p className="kpi-label">Expected annual loss</p>
                  <p className="kpi-value">{fmtUsd(preview.mean)}</p>
                  <div className="kpi-foot">
                    <span className={`chip ${overTolerance ? "chip-danger" : "chip-success"}`}>
                      {overTolerance ? "Over tolerance" : "Within tolerance"}
                    </span>
                    <span style={{ marginLeft: 8 }}>
                      {preview.pOverTolerance.toFixed(1)}% of years exceed{" "}
                      {fmtUsdShort(preview.tolerance)}
                    </span>
                  </div>
                </div>
                <div className="kpi">
                  <p className="kpi-label">Value at risk — P95</p>
                  <p className="kpi-value">{fmtUsd(preview.p95)}</p>
                  <p className="kpi-foot">1-in-20-year annual loss</p>
                </div>
                <div className="kpi">
                  <p className="kpi-label">Value at risk — P99</p>
                  <p className="kpi-value">{fmtUsd(preview.p99)}</p>
                  <p className="kpi-foot">1-in-100-year annual loss</p>
                </div>
                <div className="kpi">
                  <p className="kpi-label">Loss event frequency</p>
                  <p className="kpi-value">{preview.lef.toFixed(2)}</p>
                  <p className="kpi-foot">expected loss events per year</p>
                </div>
              </div>

              <div className="split">
                <section className="panel">
                  <div className="panel-head">
                    <h2>Simulated outcomes</h2>
                    <div className="segmented" role="tablist" aria-label="Chart view">
                      {TABS.map((t) => (
                        <button
                          key={t.key}
                          role="tab"
                          aria-selected={activeTab === t.key}
                          onClick={() => setActiveTab(t.key)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ChartPanel
                    tab={activeTab}
                    curve={preview.curve}
                    bins={preview.bins}
                    sensitivity={sensitivityRows}
                    p95={preview.p95}
                    p99={preview.p99}
                    mean={preview.mean}
                    tolerance={preview.tolerance}
                    pOverTolerance={preview.pOverTolerance}
                    withinTolerance={!overTolerance}
                    trials={PREVIEW_TRIALS}
                    stale={isStale}
                    theme={theme}
                  />
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <h2>Control coverage</h2>
                    <span className="chip chip-neutral tnum">{weightedCoverage}% weighted</span>
                  </div>
                  <div className="panel-body">
                    {scenario.controls.map((c) => (
                      <ControlSlider key={c.key} control={c} onChange={onSliderChange} />
                    ))}
                  </div>
                  <div className="summary-bar">
                    <span style={{ color: "var(--text-muted)" }}>Applied to vulnerability</span>
                    <span className="val">−{Math.round(weightedCoverage * 0.8)}%</span>
                  </div>
                </section>
              </div>

              <section className="panel" style={{ marginTop: 16 }}>
                <div className="panel-head">
                  <h2>FAIR factors</h2>
                  <span className="chip chip-neutral">
                    {recorded
                      ? `Last recorded ${new Date(recorded.createdAt).toLocaleDateString()}`
                      : "Not yet recorded"}
                  </span>
                </div>
                <div className="panel-body">
                  <div className="formula">
                    <b>Loss Event Frequency</b> = Threat Event Frequency <span className="op">×</span>{" "}
                    Vulnerability
                    <br />
                    <b>Loss Magnitude</b> = Primary Loss <span className="op">+</span> (Secondary Loss
                    Probability <span className="op">×</span> Secondary Loss Magnitude)
                  </div>
                  <table className="factor-table">
                    <thead>
                      <tr>
                        <th>Factor</th>
                        <th>Provenance</th>
                        <th>Min / Likely / Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      <FactorRow
                        name="Threat event frequency"
                        provenance="modeled"
                        tri={scenario.tef}
                        fmt={(x) => `${x.toFixed(0)}/yr`}
                      />
                      <FactorRow
                        name="Vulnerability (baseline)"
                        provenance="modeled"
                        tri={scenario.vulnBaseline}
                        // Sub-10% values need a decimal — 4.6% and 5.4% are
                        // meaningfully different and both round to "5%".
                        fmt={(x) => `${(x * 100).toFixed(1)}%`}
                      />
                      <FactorRow
                        name="Primary loss magnitude"
                        provenance="sourced"
                        tri={scenario.lossPrimary}
                        fmt={fmtUsdShort}
                      />
                      <FactorRow
                        name="Secondary loss magnitude"
                        provenance="sourced"
                        tri={scenario.lossSecondary}
                        fmt={fmtUsdShort}
                      />
                      <FactorRow
                        name="Secondary loss probability"
                        provenance="modeled"
                        tri={scenario.secProb}
                        fmt={(x) => `${(x * 100).toFixed(0)}%`}
                      />
                    </tbody>
                  </table>
                </div>
              </section>

              <Methodology scenario={scenario} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ pieces ------------------------------ */

function ControlSlider({
  control,
  onChange,
}: {
  control: ControlPayload;
  onChange: (key: string, value: number) => void;
}) {
  const sourceChip =
    control.source === "aws-config"
      ? "chip-success"
      : control.source === "demo"
      ? "chip-warning"
      : "chip-neutral";
  const sourceLabel =
    control.source === "aws-config"
      ? "AWS Config"
      : control.source === "demo"
      ? "Demo data"
      : "Manual";

  return (
    <div className="control">
      <div className="control-head">
        <span className="control-name">{control.name}</span>
        <span className="control-value">{Math.round(control.coveragePct)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={control.coveragePct}
        onChange={(e) => onChange(control.key, Number(e.target.value))}
        aria-label={`${control.name} coverage`}
        style={{
          background: `linear-gradient(to right, var(--accent) ${control.coveragePct}%, var(--bg-sunken) ${control.coveragePct}%)`,
        }}
      />
      <div className="control-foot">
        <span className={`chip ${sourceChip}`}>{sourceLabel}</span>
        <span>weight {(control.weight * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function FactorRow({
  name,
  provenance,
  tri,
  fmt,
}: {
  name: string;
  provenance: "sourced" | "modeled";
  tri: { min: number; mode: number; max: number };
  fmt: (x: number) => string;
}) {
  return (
    <tr>
      <td className="factor-name">{name}</td>
      <td>
        <span className={`chip ${provenance === "sourced" ? "chip-accent" : "chip-neutral"}`}>
          {provenance}
        </span>
      </td>
      <td className="factor-range">
        {fmt(tri.min)} · <span className="mode">{fmt(tri.mode)}</span> · {fmt(tri.max)}
      </td>
    </tr>
  );
}

/**
 * Draws the risk-appetite threshold on the exceedance curve: a dashed line at
 * the board-approved tolerance, with everything beyond it shaded. Written as a
 * small inline plugin rather than pulling in chartjs-plugin-annotation for one
 * line and one rectangle.
 */
const tolerancePlugin = {
  id: "toleranceMarker",
  afterDatasetsDraw(chart: any, _args: any, opts: any) {
    if (!opts || typeof opts.value !== "number") return;
    const { ctx, chartArea, scales } = chart;
    if (!scales?.x || !chartArea) return;

    const x = scales.x.getPixelForValue(opts.value);
    if (!isFinite(x) || x < chartArea.left) return;

    ctx.save();

    // Shade the region past tolerance — only if it's on-scale.
    if (x < chartArea.right) {
      ctx.fillStyle = opts.shade;
      ctx.fillRect(x, chartArea.top, chartArea.right - x, chartArea.bottom - chartArea.top);
    }

    if (x <= chartArea.right) {
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label flips to the left of the line when it would overflow the canvas.
      const label = opts.label ?? "Tolerance";
      ctx.font = "500 11px Inter, system-ui, sans-serif";
      const w = ctx.measureText(label).width;
      const flip = x + w + 12 > chartArea.right;
      ctx.fillStyle = opts.color;
      ctx.textAlign = flip ? "right" : "left";
      ctx.fillText(label, flip ? x - 6 : x + 6, chartArea.top + 12);
    }

    ctx.restore();
  },
};

function ChartPanel({
  tab,
  curve,
  bins,
  sensitivity,
  p95,
  p99,
  mean,
  tolerance,
  pOverTolerance,
  withinTolerance,
  trials,
  stale,
  theme,
}: {
  tab: TabKey;
  curve: { x: number; y: number }[];
  bins: { start: number; count: number }[];
  sensitivity: { name: string; low: number; high: number; range: number }[] | null;
  p95: number;
  p99: number;
  mean: number;
  tolerance: number;
  pOverTolerance: number;
  withinTolerance: boolean;
  trials: number;
  stale: boolean;
  theme: Theme;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<any>(null);
  const builtForRef = useRef<string>("");

  useEffect(() => {
    if (!canvasRef.current) return;

    const style = getComputedStyle(document.body);
    const v = (name: string) => style.getPropertyValue(name).trim();
    const accent = v("--accent");
    const grid = v("--border");
    const tickColor = v("--text-muted");
    const textColor = v("--text");
    const danger = v("--danger");
    const success = v("--success");

    // The curve itself carries the verdict: green while expected annual loss
    // sits under the ceiling, red once it doesn't.
    const curveColor = withinTolerance ? success : danger;

    const signature = `${tab}:${theme}`;
    const canReuse = chartRef.current && builtForRef.current === signature;

    const common = {
      responsive: true,
      maintainAspectRatio: false,
      // No animation on data updates: the slider already provides the motion,
      // and a 180ms tween on every keystroke reads as lag.
      animation: false as const,
      plugins: { legend: { display: false } },
    };

    if (tab === "lec") {
      const maxLoss = curve.length ? curve[curve.length - 1].x : 1;
      const makeFill = () => {
        const ctx = canvasRef.current?.getContext("2d");
        const g = ctx?.createLinearGradient(0, 0, 0, 300);
        g?.addColorStop(0, curveColor + "33");
        g?.addColorStop(1, curveColor + "05");
        return g ?? curveColor + "22";
      };

      if (canReuse) {
        const ds = chartRef.current.data.datasets[0];
        ds.data = curve;
        ds.borderColor = curveColor;
        ds.backgroundColor = makeFill();
        chartRef.current.options.scales.x.max = maxLoss;
        chartRef.current.options.plugins.toleranceMarker.value = tolerance;
        chartRef.current.options.plugins.toleranceMarker.color = danger;
        chartRef.current.options.plugins.toleranceMarker.shade = danger + "0f";
        chartRef.current.update("none");
      } else {
        chartRef.current?.destroy();
        chartRef.current = new Chart(canvasRef.current, {
          type: "line",
          plugins: [tolerancePlugin],
          data: {
            datasets: [
              {
                data: curve,
                borderColor: curveColor,
                backgroundColor: makeFill(),
                fill: true,
                tension: 0.35,
                pointRadius: 0,
                borderWidth: 2,
              },
            ],
          },
          options: {
            ...common,
            plugins: {
              legend: { display: false },
              toleranceMarker: {
                value: tolerance,
                color: danger,
                shade: danger + "0f",
                label: `Tolerance ${fmtUsdShort(tolerance)}`,
              },
              tooltip: {
                callbacks: {
                  title: (items: any) => "Loss ≥ " + fmtUsd((items[0].parsed as any).x),
                  label: (item: any) =>
                    ((item.parsed as any).y as number).toFixed(1) + "% chance within 12 months",
                },
              },
            },
            scales: {
              x: {
                type: "linear",
                min: 0,
                max: maxLoss,
                border: { display: false },
                ticks: {
                  callback: (val: any) => fmtUsdShort(val as number),
                  color: tickColor,
                  maxTicksLimit: 7,
                },
                grid: { color: grid },
              },
              y: {
                min: 0,
                max: 100,
                border: { display: false },
                ticks: { callback: (val: any) => val + "%", color: tickColor, maxTicksLimit: 6 },
                grid: { color: grid },
              },
            },
          } as any,
        });
        builtForRef.current = signature;
      }
    }

    if (tab === "hist") {
      const labels = bins.map((b) => fmtUsdShort(b.start));
      const counts = bins.map((b) => b.count);
      if (canReuse) {
        chartRef.current.data.labels = labels;
        chartRef.current.data.datasets[0].data = counts;
        chartRef.current.update("none");
      } else {
        chartRef.current?.destroy();
        chartRef.current = new Chart(canvasRef.current, {
          type: "bar",
          data: {
            labels,
            datasets: [
              { data: counts, backgroundColor: accent + "cc", borderRadius: 3, borderWidth: 0 },
            ],
          },
          options: {
            ...common,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (item: any) =>
                    `${(item.parsed as any).y} of ${trials.toLocaleString()} simulated years`,
                },
              },
            },
            scales: {
              x: {
                border: { display: false },
                ticks: { color: tickColor, maxTicksLimit: 8 },
                grid: { display: false },
              },
              y: {
                border: { display: false },
                ticks: { color: tickColor, maxTicksLimit: 6 },
                grid: { color: grid },
              },
            },
          } as any,
        });
        builtForRef.current = signature;
      }
    }

    if (tab === "tornado" && sensitivity) {
      const labels = sensitivity.map((r) => r.name);
      const ranges = sensitivity.map((r) => [Math.min(r.low, r.high), Math.max(r.low, r.high)]);
      if (canReuse) {
        chartRef.current.data.labels = labels;
        chartRef.current.data.datasets[0].data = ranges;
        chartRef.current.update("none");
      } else {
        chartRef.current?.destroy();
        chartRef.current = new Chart(canvasRef.current, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                data: ranges as any,
                backgroundColor: accent + "cc",
                borderRadius: 3,
                borderWidth: 0,
              },
            ],
          },
          options: {
            ...common,
            indexAxis: "y",
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (item: any) => {
                    const raw = item.raw as [number, number];
                    return `${fmtUsd(raw[0])} – ${fmtUsd(raw[1])}`;
                  },
                },
              },
            },
            scales: {
              x: {
                border: { display: false },
                ticks: {
                  callback: (val: any) => fmtUsdShort(val as number),
                  color: tickColor,
                  maxTicksLimit: 6,
                },
                grid: { color: grid },
              },
              y: {
                border: { display: false },
                ticks: { color: textColor },
                grid: { display: false },
              },
            },
          } as any,
        });
        builtForRef.current = signature;
      }
    }
  }, [tab, curve, bins, sensitivity, theme, trials, tolerance, withinTolerance]);

  useEffect(() => {
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
      builtForRef.current = "";
    };
  }, []);

  const caption =
    tab === "lec"
      ? `The probability of losing at least a given amount within 12 months. The shaded region sits beyond the ${fmtUsdShort(
          tolerance
        )} tolerance ceiling — ${pOverTolerance.toFixed(
          1
        )}% of simulated years land there. P95 falls at ${fmtUsd(p95)}, P99 at ${fmtUsd(p99)}.`
      : tab === "hist"
      ? `Distribution of ${trials.toLocaleString()} simulated annual-loss totals. The long right tail is why the mean of ${fmtUsd(
          mean
        )} sits well above the typical year.`
      : "Each bar holds every other factor at its likely value and swings this one from its low to its high estimate. The widest bar contributes the most uncertainty.";

  return (
    <>
      <div className={`chart-wrap${stale ? " is-stale" : ""}`}>
        <canvas ref={canvasRef} />
      </div>
      <p className="chart-caption">{caption}</p>
    </>
  );
}

function Methodology({ scenario }: { scenario: ScenarioPayload }) {
  return (
    <section className="panel" id="methodology" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <h2>Methodology</h2>
        <span className="chip chip-neutral">Open Group FAIR</span>
      </div>
      <div className="panel-body">
        <div className="method-cols">
          <div>
            <h3>Sourced inputs</h3>
            <p>
              Loss magnitude is calibrated to this industry&apos;s average total cost of a data
              breach, split into primary and secondary loss using the report&apos;s own
              cost-category breakdown — both from {scenario.sourceCitation}.
            </p>
            <ul>
              <li>Industry average total cost, per profile.</li>
              <li>Cost-category split: lost business, post-breach response, notification.</li>
              <li>
                Ransomware appeared in 44% of confirmed breaches in the 2025 Verizon DBIR, up from
                32% — context only, not an input to the magnitude figures.
              </li>
            </ul>
          </div>
          <div>
            <h3>Modeled assumptions</h3>
            <p>
              Threat event frequency and the vulnerability baseline aren&apos;t published at this
              granularity, so they&apos;re stated as explicit assumptions rather than dressed up as
              data. Recalibrate them against your own detection telemetry.
            </p>
            <p>
              Every factor carries a provenance chip, and every control&apos;s coverage records
              whether it came from AWS Config, manual entry, or demo data.
            </p>
          </div>
        </div>

        <div className="method-cols" style={{ marginTop: 20 }}>
          <div>
            <h3>Exploring vs. recording</h3>
            <p>
              Moving a control slider re-runs the model in the browser at{" "}
              {PREVIEW_TRIALS.toLocaleString()} trials, so the charts respond immediately and
              nothing is written. Recording an assessment runs the full simulation server-side and
              writes an immutable row to the register — the audit trail holds deliberate
              assessments, not every adjustment.
            </p>
          </div>
          <div>
            <h3>Known simplifications</h3>
            <p>
              Full FAIR practice samples from Beta-PERT distributions and separates threat
              capability from resistance strength. This model uses triangular distributions and
              folds three controls into a single vulnerability multiplier — built to make the
              mechanics legible, not to replace a calibrated commercial tool.
            </p>
          </div>
        </div>

        <p className="sources">
          Sources: IBM Security,{" "}
          <a
            href="https://www.ibm.com/think/x-force/2025-cost-of-a-data-breach-navigating-ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cost of a Data Breach Report 2025
          </a>{" "}
          · Verizon,{" "}
          <a
            href="https://www.verizon.com/business/resources/reports/2025-dbir-data-breach-investigations-report.pdf"
            target="_blank"
            rel="noopener noreferrer"
          >
            2025 Data Breach Investigations Report
          </a>{" "}
          · Framework: The Open Group, FAIR.
        </p>
      </div>
    </section>
  );
}
