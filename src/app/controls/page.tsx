"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ControlTable, type ControlRow, type FrameworkColumn } from "@/components/ControlTable";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { UploadCatalogPanel } from "@/components/UploadCatalogPanel";
import { EvidenceModal } from "@/components/EvidenceModal";
import type { NormalizedControl } from "@/lib/catalog-parser";
import { coverageByFramework, averageOfFrameworks, mapsToFramework } from "@/lib/coverage";

export default function ControlsPage() {
  const [frameworks, setFrameworks] = useState<FrameworkColumn[]>([]);
  const [controls, setControls] = useState<ControlRow[]>([]);
  const [frameworkIds, setFrameworkIds] = useState<string[]>(["nist_csf"]);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ filename: string; controls: NormalizedControl[] } | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<{
    id: string;
    name: string;
    coveragePct?: number;
    coverageSource?: string;
  } | null>(null);
  // Quick knob on the Average Coverage tile itself — editing 8 rows one at a
  // time to move the headline number is too slow for a live demo.
  const [bulkPct, setBulkPct] = useState("");
  const [applyingBulk, setApplyingBulk] = useState(false);
  // While a framework slider is being dragged we show the dragged value
  // locally and only write on release — otherwise every pixel of drag fires a
  // round of PATCHes.
  const [draftFw, setDraftFw] = useState<Record<string, number>>({});
  const [savingFw, setSavingFw] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/scenarios", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setFrameworks(data.frameworks);
      setControls(data.controls);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load control posture");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patchCoverage(controlId: string, coveragePct: number) {
    const res = await fetch("/api/controls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlId, coveragePct }),
    });
    return res.ok;
  }

  async function overrideCoverage(controlId: string, coveragePct: number) {
    if (await patchCoverage(controlId, coveragePct)) load();
  }

  // Set every control to the same coverage, then reload once — not once per
  // control, which would fire N overlapping refetches.
  async function applyBulkCoverage() {
    const pct = Number(bulkPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || controls.length === 0) return;
    setApplyingBulk(true);
    try {
      await Promise.all(controls.map((c) => patchCoverage(c.id, pct)));
      await load();
      setBulkPct("");
    } finally {
      setApplyingBulk(false);
    }
  }

  // Set every control mapped to this framework to the same coverage.
  async function applyFrameworkCoverage(fwId: string, pct: number) {
    const fw = frameworks.find((f) => f.id === fwId);
    if (!fw) return;
    const mapped = controls.filter((c) => mapsToFramework(c, fw.field));
    if (mapped.length === 0) return;
    setSavingFw(fwId);
    try {
      await Promise.all(mapped.map((c) => patchCoverage(c.id, pct)));
      await load();
    } finally {
      setSavingFw(null);
      setDraftFw((d) => {
        const next = { ...d };
        delete next[fwId];
        return next;
      });
    }
  }

  async function syncAws() {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/aws-config", { method: "POST" });
      if (res.ok) await load();
    } finally {
      setSyncing(false);
    }
  }

  const activeColumns = frameworks.filter((f) => frameworkIds.includes(f.id));
  const displayRows: ControlRow[] = uploaded
    ? uploaded.controls.map((c) => ({ ...c, coveragePct: undefined, coverageSource: undefined }))
    : controls;

  // Coverage rolls up per framework first, then averages those — see
  // src/lib/coverage.ts for why equal framework weighting beats a raw
  // control-level mean.
  const frameworkCoverage = coverageByFramework(controls, frameworks);
  // Headline average covers only the frameworks currently selected in the
  // picker — "our NIST + ISO posture" is a different number from "our posture
  // across all six", and the tile should answer whichever one is on screen.
  // With nothing selected there's no meaningful subset, so fall back to all.
  const scoredFrameworks = frameworkCoverage.filter((f) => f.coveragePct !== null);
  const countedFrameworks =
    frameworkIds.length > 0 ? scoredFrameworks.filter((f) => frameworkIds.includes(f.id)) : scoredFrameworks;
  const avgCoverage = averageOfFrameworks(countedFrameworks);
  const sourceCounts = controls.reduce<Record<string, number>>((acc, c) => {
    const src = c.coverageSource ?? "DEMO";
    acc[src] = (acc[src] ?? 0) + 1;
    return acc;
  }, {});
  const coverageColor =
    avgCoverage >= 80 ? "text-emerald-400" : avgCoverage >= 50 ? "text-amber-400" : "text-risk";

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Control Posture</h1>
        <p className="text-slate-400 mt-1">
          Compliance-as-code control catalog, cross-mapped to six frameworks, with provenance-tagged coverage.
        </p>
      </header>

      {loadError && (
        <div className="mb-6 rounded-lg border border-risk/30 bg-risk/10 text-risk px-4 py-3 text-sm">{loadError}</div>
      )}

      {!uploaded && controls.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Average Coverage</div>
            <div className={`text-xl font-mono font-semibold tabular-nums ${coverageColor}`}>{avgCoverage.toFixed(0)}%</div>
            <div className="flex items-center gap-1.5 mt-2">
              <input
                type="number"
                min={0}
                max={100}
                value={bulkPct}
                onChange={(e) => setBulkPct(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyBulkCoverage();
                }}
                placeholder="Set all"
                aria-label="Set coverage for every control"
                className="w-20 bg-surface2 border border-border rounded px-1.5 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent/60"
              />
              <button
                onClick={applyBulkCoverage}
                disabled={applyingBulk || bulkPct === ""}
                className="text-xs px-2 py-1 rounded border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors"
              >
                {applyingBulk ? "Applying…" : "Apply to all"}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Controls Tracked</div>
            <div className="text-xl font-mono font-semibold tabular-nums text-slate-100">{controls.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Frameworks Shown</div>
            <div className="text-xl font-mono font-semibold tabular-nums text-slate-100">
              {activeColumns.length}
              <span className="text-sm text-slate-500 font-normal"> / {frameworks.length}</span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Coverage Provenance</div>
            <div className="text-xs text-slate-300 mt-1.5 space-x-2">
              {Object.entries(sourceCounts).map(([src, count]) => (
                <span key={src}>
                  <span className="text-slate-100 font-medium">{count}</span> {src}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {!uploaded && controls.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5 mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <h3 className="font-semibold text-slate-100">Coverage by framework</h3>
            <span className="text-xs text-slate-500">
              Average of the {countedFrameworks.length}{" "}
              {frameworkIds.length > 0 ? "selected" : "scored"} framework
              {countedFrameworks.length === 1 ? "" : "s"} ={" "}
              <span className="font-mono text-slate-300">{avgCoverage.toFixed(0)}%</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mb-4">
            Drag a slider to set every control mapped to that framework at once. Controls are cross-mapped, so moving
            one framework moves the others that share those controls — that overlap is the point of a single control
            catalogue.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
            {frameworkCoverage.map((f) => {
              const counted = frameworkIds.length === 0 || frameworkIds.includes(f.id);
              const live = draftFw[f.id] ?? f.coveragePct ?? 0;
              const disabled = f.coveragePct === null || savingFw !== null || !!uploaded;
              return (
                <div key={f.id} className={counted ? "" : "opacity-45"}>
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-sm text-slate-300 truncate" title={f.label}>
                      {f.label}
                      {!counted && <span className="text-[10px] text-slate-600 ml-1.5">not counted</span>}
                    </span>
                    <span className="flex items-baseline gap-2 shrink-0">
                      <span
                        className={`font-mono text-sm tabular-nums ${
                          f.coveragePct === null
                            ? "text-slate-600"
                            : live >= 80
                            ? "text-emerald-400"
                            : live >= 50
                            ? "text-amber-400"
                            : "text-risk"
                        }`}
                      >
                        {f.coveragePct === null ? "—" : `${Math.round(live)}%`}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {f.mappedCount} control{f.mappedCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={live}
                    disabled={disabled}
                    aria-label={`${f.label} coverage`}
                    onChange={(e) => setDraftFw((d) => ({ ...d, [f.id]: Number(e.target.value) }))}
                    onPointerUp={(e) => applyFrameworkCoverage(f.id, Number((e.target as HTMLInputElement).value))}
                    onKeyUp={(e) => applyFrameworkCoverage(f.id, Number((e.target as HTMLInputElement).value))}
                    className="w-full disabled:opacity-40"
                  />
                </div>
              );
            })}
          </div>
          {savingFw && <div className="text-[11px] text-slate-500 mt-3">Saving coverage…</div>}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div className="w-full max-w-sm">
          <MultiSelectDropdown
            label="Compliance Frameworks (select any number)"
            placeholder="Select frameworks"
            itemNoun="frameworks"
            options={frameworks.map((f) => ({ id: f.id, label: f.label }))}
            selected={frameworkIds}
            onChange={setFrameworkIds}
          />
        </div>
        <div className="flex gap-2">
          <a
            href="/api/reports/export?format=csv"
            className="text-sm px-3 py-1.5 rounded-lg border border-border text-slate-300 hover:bg-surface2 transition-colors"
          >
            Export CSV
          </a>
          <a
            href="/api/reports/export?format=pdf"
            className="text-sm px-3 py-1.5 rounded-lg border border-border text-slate-300 hover:bg-surface2 transition-colors"
          >
            Export PDF
          </a>
        </div>
      </div>

      <div className="mb-8">
        <ControlTable
          rows={displayRows}
          frameworkColumns={activeColumns}
          editable={!uploaded}
          onOverride={overrideCoverage}
          onSyncAws={syncAws}
          syncing={syncing}
          onViewEvidence={
            uploaded
              ? undefined
              : (id, name, coveragePct, coverageSource) => setEvidenceFor({ id, name, coveragePct, coverageSource })
          }
        />
      </div>

      <UploadCatalogPanel
        active={uploaded ? { filename: uploaded.filename, count: uploaded.controls.length } : null}
        onLoaded={(parsed, filename) => setUploaded({ filename, controls: parsed })}
        onCleared={() => setUploaded(null)}
      />

      {evidenceFor && (
        <EvidenceModal
          controlId={evidenceFor.id}
          controlName={evidenceFor.name}
          coveragePct={evidenceFor.coveragePct}
          coverageSource={evidenceFor.coverageSource}
          onClose={() => setEvidenceFor(null)}
        />
      )}
    </AppShell>
  );
}
