"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ControlTable, type ControlRow, type FrameworkColumn } from "@/components/ControlTable";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { atLeast, ROLE_LABEL, type Role } from "@/lib/roles";
import { UploadCatalogPanel } from "@/components/UploadCatalogPanel";
import { EvidenceModal } from "@/components/EvidenceModal";
import type { NormalizedControl } from "@/lib/catalog-parser";
import {
  coverageByFramework,
  averageOfFrameworks,
  averageAssessed,
  mapsToFramework,
  identicalSetPeers,
} from "@/lib/coverage";
import { Modal } from "@/components/Modal";
import { StatusBadge } from "@/components/StatusBadge";

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
  const [requestOpen, setRequestOpen] = useState(false);
  // Who is signed in. Coverage is a CONTROL_OWNER action (the S5 boundary), so
  // an analyst dragging a slider was getting a silent 403 and watching the
  // value snap back with no explanation. The UI now reflects the rule.
  const [viewerRole, setViewerRole] = useState<Role | null>(null);
  // Any failure from a coverage write, surfaced instead of swallowed.
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [reqName, setReqName] = useState("");
  const [reqReason, setReqReason] = useState("");

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
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setViewerRole(d?.user?.role ?? null))
      .catch(() => setViewerRole(null));
  }, []);

  // Null while /api/auth/me is in flight — treated as "not yet allowed" so the
  // controls do not flicker from enabled to disabled.
  const canEditCoverage = viewerRole !== null && atLeast(viewerRole, "CONTROL_OWNER");

  /**
   * Throws on failure rather than returning a boolean every caller ignored.
   *
   * That silent `return res.ok` is why the framework sliders looked broken: a
   * viewer or analyst has no authority to set coverage (the S5 boundary), the
   * server correctly returned 403, and the UI said nothing at all — the value
   * simply snapped back on reload. The refusal was right; the silence was the
   * bug, and it is the same class P1 was about.
   */
  async function patchCoverage(controlId: string, coveragePct: number) {
    const res = await fetch("/api/controls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlId, coveragePct }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error ??
          (res.status === 403
            ? "Your role cannot change control coverage."
            : `Could not save coverage (${res.status}).`)
      );
    }
  }

  async function overrideCoverage(controlId: string, coveragePct: number) {
    setCoverageError(null);
    try {
      await patchCoverage(controlId, coveragePct);
      await load();
    } catch (err) {
      setCoverageError(err instanceof Error ? err.message : "Could not save coverage");
    }
  }

  // Set every control to the same coverage, then reload once — not once per
  // control, which would fire N overlapping refetches.
  async function applyBulkCoverage() {
    const pct = Number(bulkPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || controls.length === 0) return;
    setApplyingBulk(true);
    setCoverageError(null);
    try {
      await Promise.all(controls.map((c) => patchCoverage(c.id, pct)));
      await load();
      setBulkPct("");
    } catch (err) {
      // patchCoverage throws now. Without this the rejection was unhandled and
      // the user saw nothing — the same silence the slider had.
      setCoverageError(err instanceof Error ? err.message : "Could not save coverage");
      await load();
    } finally {
      setApplyingBulk(false);
    }
  }

  // SHIFT the mapped controls by the delta needed to move this framework's
  // average to the target — don't flatten them all to the same number.
  // Flattening sets every control to one value, and since the frameworks
  // share most of their controls, that forced all six averages to become
  // identical: the sliders could never disagree. Shifting preserves each
  // control's own level, so frameworks with different control sets land on
  // different averages. Shared controls still move (that is real — they are
  // the same control), just not to the same place.
  async function applyFrameworkCoverage(fwId: string, targetPct: number) {
    const fw = frameworks.find((f) => f.id === fwId);
    if (!fw) return;
    const mapped = controls.filter((c) => mapsToFramework(c, fw.field));
    if (mapped.length === 0) return;
    const current = mapped.reduce((sum, c) => sum + (c.coveragePct ?? 0), 0) / mapped.length;
    const delta = targetPct - current;
    if (Math.round(delta) === 0) return;
    setSavingFw(fwId);
    setCoverageError(null);
    try {
      await Promise.all(
        mapped.map((c) => {
          // Clamped, so a control already at 0 or 100 stops there — the
          // framework average may then fall slightly short of the target,
          // and the slider snaps to the real value on reload.
          const next = Math.min(Math.max(Math.round((c.coveragePct ?? 0) + delta), 0), 100);
          return patchCoverage(c.id, next);
        })
      );
      await load();
    } catch (err) {
      setCoverageError(err instanceof Error ? err.message : "Could not save coverage");
      // Re-read so the slider shows the stored value rather than a change the
      // server refused.
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
  const scoredFrameworks = frameworkCoverage.filter((f) => f.implementationPct !== null);
  const countedFrameworks =
    frameworkIds.length > 0 ? scoredFrameworks.filter((f) => frameworkIds.includes(f.id)) : scoredFrameworks;
  const avgCoverage = averageOfFrameworks(countedFrameworks);
  // G2: the number that can honestly sit beside a framework's name.
  const avgAssessed = averageAssessed(countedFrameworks);
  const sourceCounts = controls.reduce<Record<string, number>>((acc, c) => {
    const src = c.coverageSource ?? "DEMO";
    acc[src] = (acc[src] ?? 0) + 1;
    return acc;
  }, {});
  // Audit A2 / WCAG 2.2 1.4.1: the band was carried by colour alone. The
  // percentage is shown either way, but "is 62% good?" is exactly the
  // judgement the colour was making silently — so it is now stated in words
  // as well, with the band boundaries named so the reader can check it.
  const coverageBand =
    avgCoverage >= 80
      ? { status: "pass" as const, color: "text-emerald-400", label: "Strong (80%+)" }
      : avgCoverage >= 50
      ? { status: "warn" as const, color: "text-amber-400", label: "Partial (50–79%)" }
      : { status: "fail" as const, color: "text-risk", label: "Weak (under 50%)" };
  const coverageColor = coverageBand.color;

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Control Posture</h1>
        <p className="text-slate-400 mt-1">
          Compliance-as-code control catalogue, cross-mapped to six frameworks, with provenance-tagged coverage.
        </p>
        <p className="text-sm text-amber-400/90 mt-3 border border-amber-400/30 bg-amber-500/10 rounded-lg px-3 py-2">
          <span className="font-semibold">Partial mapping — a starter set, not a complete framework implementation.</span>{" "}
          <span className="text-slate-300">
            This catalogue holds {controls.length} controls. The frameworks below run to dozens or hundreds of
            requirements each, so an implementation percentage on its own would overstate posture by an order of
            magnitude. Scope and implementation are reported separately, and only their product is labelled coverage.
          </span>
        </p>
      </header>

      {loadError && (
        <div className="mb-6 rounded-lg border border-risk/30 bg-risk/10 text-risk px-4 py-3 text-sm">{loadError}</div>
      )}

      {!uploaded && controls.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-slate-400 mb-1">
              Average Implementation
              <span className="block text-[10px] text-slate-600 leading-tight">of mapped controls only</span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-xl font-mono font-semibold tabular-nums ${coverageColor}`}>
                {avgCoverage.toFixed(0)}%
              </span>
              <StatusBadge status={coverageBand.status}>{coverageBand.label}</StatusBadge>
            </div>
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
                disabled={applyingBulk || bulkPct === "" || !canEditCoverage}
                title={canEditCoverage ? undefined : "Setting control coverage requires the Control Owner role."}
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
            <div className="text-xs text-slate-400 mb-1">
              Assessed Coverage
              <span className="block text-[10px] text-slate-600 leading-tight">scope x implementation</span>
            </div>
            <div className="text-xl font-mono font-semibold tabular-nums text-slate-100">
              {avgAssessed === null ? "—" : `${avgAssessed.toFixed(1)}%`}
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
            Three different questions, never collapsed into one number.{" "}
            <span className="text-slate-400">Scope</span> is how much of the framework this catalogue addresses at
            all. <span className="text-slate-400">Implementation</span> is how well the controls we do map are run —
            that is what the slider edits. <span className="text-slate-400">Assessed coverage</span> is their product,
            and it is the only one of the three that can honestly sit beside a framework&apos;s name.
            <br />
            Controls are cross-mapped, so dragging one framework moves the others that share those controls — by less,
            in proportion to how many they share. Their scope still differs, because each framework has its own
            requirement population.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
            {frameworkCoverage.map((f) => {
              const counted = frameworkIds.length === 0 || frameworkIds.includes(f.id);
              const peers = identicalSetPeers(f, frameworkCoverage);
              const live = draftFw[f.id] ?? f.implementationPct ?? 0;
              // Three distinct reasons a slider is inert, kept apart so the UI
              // can say which one applies instead of just greying out.
              const noMappedControls = f.implementationPct === null;
              const disabledReason = noMappedControls
                ? "No controls in this catalogue map to this framework yet, so there is no implementation figure to move."
                : uploaded
                ? "Coverage cannot be edited while viewing an uploaded catalogue."
                : !canEditCoverage
                ? `Setting control coverage requires the Control Owner role.${
                    viewerRole ? ` You are signed in as ${ROLE_LABEL[viewerRole]}.` : ""
                  }`
                : null;
              const disabled = disabledReason !== null || savingFw !== null;
              // Assessed coverage recomputed against the dragged value, so the
              // bottom line moves with the slider rather than lagging a save.
              const liveAssessed = f.scopePct === null ? null : (f.scopePct * live) / 100;
              return (
                <div key={f.id} className={counted ? "" : "opacity-45"}>
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-sm text-slate-200 truncate" title={f.label}>
                      {f.label}
                      {!counted && <span className="text-[10px] text-slate-600 ml-1.5">not counted</span>}
                      {peers.length > 0 && (
                        <span
                          className="text-[10px] text-slate-500 ml-1.5 border border-border rounded px-1 py-px"
                          title={`Maps to exactly the same controls as: ${peers.join(
                            ", "
                          )}. Implementation is therefore shared — but scope differs, because each framework has its own requirement population.`}
                        >
                          shared controls
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Scope — how much of the framework this catalogue addresses at all. */}
                  <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-500">
                    <span>
                      Scope ·{" "}
                      {f.population === null
                        ? "no single requirement population"
                        : `${f.distinctReferences} of ${f.approximate ? "~" : ""}${f.population} ${f.unit}`}
                    </span>
                    <span className="font-mono text-slate-400">
                      {f.scopePct === null ? "n/a" : `${f.scopePct.toFixed(1)}%`}
                    </span>
                  </div>

                  {/* Implementation — the only dimension the slider edits. */}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-slate-500 shrink-0 w-24">Implementation</span>
                    {/* touch-none is load-bearing: without it a horizontal drag
                        on a phone is claimed by the page as a scroll gesture and
                        the thumb never moves, which is why these felt dead on
                        mobile even for a Control Owner. */}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={live}
                      disabled={disabled}
                      aria-label={`${f.label} implementation across mapped controls`}
                      title={disabledReason ?? undefined}
                      onChange={(e) => setDraftFw((d) => ({ ...d, [f.id]: Number(e.target.value) }))}
                      onPointerUp={(e) => applyFrameworkCoverage(f.id, Number((e.target as HTMLInputElement).value))}
                      onKeyUp={(e) => applyFrameworkCoverage(f.id, Number((e.target as HTMLInputElement).value))}
                      className="flex-1 touch-none disabled:opacity-40"
                    />
                    <span
                      className={`font-mono text-sm tabular-nums w-12 text-right shrink-0 ${
                        f.implementationPct === null
                          ? "text-slate-600"
                          : live >= 80
                          ? "text-emerald-400"
                          : live >= 50
                          ? "text-amber-400"
                          : "text-risk"
                      }`}
                    >
                      {f.implementationPct === null ? "—" : `${Math.round(live)}%`}
                    </span>
                  </div>

                  {disabledReason && (
                    <p className="text-[10px] text-slate-500 mt-1 pl-[6.75rem]">{disabledReason}</p>
                  )}

                  {/* Assessed — scope x implementation. The honest headline. */}
                  <div className="flex items-baseline justify-between gap-2 text-[11px] mt-1 pt-1 border-t border-white/5">
                    <span className="text-slate-500">
                      Assessed coverage{" "}
                      <span className="text-slate-600">
                        {f.scopePct !== null ? `(${f.scopePct.toFixed(1)}% x ${Math.round(live)}%)` : ""}
                      </span>
                    </span>
                    <span className="font-mono text-slate-200">
                      {liveAssessed === null ? "not quantified" : `${liveAssessed.toFixed(1)}%`}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-600 mt-1">
                    {f.mappedCount} control{f.mappedCount === 1 ? "" : "s"} mapped
                  </div>
                </div>
              );
            })}
          </div>

          {savingFw && <div className="text-[11px] text-slate-500 mt-3">Saving coverage…</div>}
          {coverageError && (
            <p role="status" className="text-xs text-risk mt-3">
              {coverageError}
            </p>
          )}
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
            footer={
              <button
                type="button"
                onClick={() => setRequestOpen(true)}
                className="w-full text-left text-xs text-accent hover:text-accent2"
              >
                + Request another framework&hellip;
              </button>
            }
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

      {requestOpen && (
        <Modal title="Request a framework" onClose={() => setRequestOpen(false)}>
          <p className="text-sm text-slate-400 mb-4">
            Tell us which framework you need mapped and we&apos;ll add it to the control catalogue. Existing controls get
            cross-mapped to it, so coverage carries over — you will not be starting from zero.
          </p>
          <label className="flex flex-col gap-1.5 mb-3">
            <span className="text-xs font-medium text-slate-400">Framework</span>
            <input
              className="select"
              value={reqName}
              onChange={(e) => setReqName(e.target.value)}
              placeholder="e.g. NIS2, DORA, HIPAA Security Rule, CIS Controls v8"
            />
          </label>
          <label className="flex flex-col gap-1.5 mb-4">
            <span className="text-xs font-medium text-slate-400">What is driving it? (optional)</span>
            <textarea
              className="select"
              rows={3}
              value={reqReason}
              onChange={(e) => setReqReason(e.target.value)}
              placeholder="e.g. customer contract, regulator, upcoming audit"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRequestOpen(false)}
              className="text-sm px-3 py-2 rounded-lg border border-border text-slate-300 hover:bg-white/10"
            >
              Cancel
            </button>
            {/* ponytail: mailto is the whole submission pipeline — no endpoint,
                no schema, and it genuinely reaches a person. Swap for a POST to
                a FrameworkRequest table when these need tracking or an SLA. */}
            <a
              href={`mailto:grc@fair-risk-radar.example?subject=${encodeURIComponent(
                `Framework request: ${reqName || "(unnamed)"}`
              )}&body=${encodeURIComponent(
                `Framework: ${reqName}\n\nDriver: ${reqReason}\n\nCurrent catalogue: ${controls.length} controls across ${frameworks.length} frameworks.`
              )}`}
              onClick={() => setRequestOpen(false)}
              className={`btn-primary ${reqName.trim() === "" ? "pointer-events-none opacity-40" : ""}`}
            >
              Send request
            </a>
          </div>
        </Modal>
      )}

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
