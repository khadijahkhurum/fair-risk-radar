"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ControlTable, type ControlRow, type FrameworkColumn } from "@/components/ControlTable";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { UploadCatalogPanel } from "@/components/UploadCatalogPanel";
import { EvidenceModal } from "@/components/EvidenceModal";
import type { NormalizedControl } from "@/lib/catalog-parser";

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

  async function load() {
    try {
      const res = await fetch("/api/scenarios");
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

  async function overrideCoverage(controlId: string, coveragePct: number) {
    const res = await fetch("/api/controls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlId, coveragePct }),
    });
    if (res.ok) load();
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

  const avgCoverage =
    controls.length > 0 ? controls.reduce((sum, c) => sum + (c.coveragePct ?? 0), 0) / controls.length : 0;
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
            <div className={`text-xl font-semibold tabular-nums ${coverageColor}`}>{avgCoverage.toFixed(0)}%</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Controls Tracked</div>
            <div className="text-xl font-semibold tabular-nums text-slate-100">{controls.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">Frameworks Mapped</div>
            <div className="text-xl font-semibold tabular-nums text-slate-100">{frameworks.length}</div>
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
