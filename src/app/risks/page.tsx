"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { RiskHeatmap, type HeatmapPoint } from "@/components/RiskHeatmap";
import { riskScoreLabel } from "@/lib/risk-rating";

interface Scenario {
  id: string;
  name: string;
}
interface Threat {
  id: string;
  name: string;
}
interface Risk {
  id: string;
  title: string;
  description: string;
  ownerName: string;
  status: "OPEN" | "MITIGATING" | "ACCEPTED" | "CLOSED";
  scenarioId: string;
  threatIds: string[];
  riskTolerance: number | null;
  inherentLikelihood: number;
  inherentImpact: number;
  residualLikelihood: number;
  residualImpact: number;
  latestAssessment: { meanAle: number } | null;
  createdAt: string;
}

const STATUSES: Risk["status"][] = ["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"];
const STATUS_STYLES: Record<Risk["status"], string> = {
  OPEN: "bg-risk/15 text-risk border-risk/30",
  MITIGATING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ACCEPTED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  CLOSED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const currencyFull = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

export default function RisksPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function loadRisks() {
    const res = await fetch("/api/risks");
    const data = await res.json();
    if (res.ok) setRisks(data.risks);
    else setLoadError(data.error ?? "Failed to load risk register");
  }

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data) => {
        setScenarios(data.scenarios);
        setThreats(data.threats);
      });
    loadRisks();
  }, []);

  async function updateStatus(id: string, status: Risk["status"]) {
    const res = await fetch(`/api/risks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) loadRisks();
  }

  const inherentPoints: HeatmapPoint[] = risks.map((r) => ({
    id: r.id,
    title: r.title,
    likelihood: r.inherentLikelihood,
    impact: r.inherentImpact,
  }));
  const residualPoints: HeatmapPoint[] = risks.map((r) => ({
    id: r.id,
    title: r.title,
    likelihood: r.residualLikelihood,
    impact: r.residualImpact,
  }));

  return (
    <AppShell>
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Risk Register</h1>
          <p className="text-slate-400 mt-1">
            Named risks someone owns and works — inherent and residual ratings bridge the FAIR model to a
            committee-readable heatmap.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="shrink-0 px-4 py-2 rounded-lg bg-gradient-to-r from-accent to-accent2 text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          + New Risk
        </button>
      </header>

      {loadError && (
        <div className="mb-6 rounded-lg border border-risk/30 bg-risk/10 text-risk px-4 py-3 text-sm">{loadError}</div>
      )}

      {risks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 rounded-xl border border-border bg-surface p-5">
          <RiskHeatmap title="Inherent Risk (before controls)" points={inherentPoints} />
          <RiskHeatmap title="Residual Risk (after controls)" points={residualPoints} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-slate-100">Register</h3>
        </div>
        {risks.length === 0 ? (
          <p className="text-sm text-slate-500 p-5">
            No risks tracked yet. Click &quot;+ New Risk&quot; to add the first one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-border">
                  <th className="px-5 py-3 font-medium">Risk</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Inherent</th>
                  <th className="px-5 py-3 font-medium">Residual</th>
                  <th className="px-5 py-3 font-medium">Latest Mean ALE</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => {
                  const inherent = riskScoreLabel(r.inherentLikelihood, r.inherentImpact);
                  const residual = riskScoreLabel(r.residualLikelihood, r.residualImpact);
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-100">{r.title}</div>
                        <div className="text-xs text-slate-500">{r.description}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-300">{r.ownerName}</td>
                      <td className="px-5 py-3">
                        <select
                          value={r.status}
                          onChange={(e) => updateStatus(r.id, e.target.value as Risk["status"])}
                          className={`text-xs px-2 py-1 rounded border bg-transparent ${STATUS_STYLES[r.status]}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s} className="bg-surface2 text-slate-100">
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded text-white ${inherent.className}`}>
                          {inherent.label} ({r.inherentLikelihood}×{r.inherentImpact})
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded text-white ${residual.className}`}>
                          {residual.label} ({r.residualLikelihood}×{r.residualImpact})
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-300 tabular-nums">
                        {r.latestAssessment ? currencyFull(r.latestAssessment.meanAle) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <NewRiskModal
          scenarios={scenarios}
          threats={threats}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            loadRisks();
          }}
        />
      )}
    </AppShell>
  );
}

function NewRiskModal({
  scenarios,
  threats,
  onClose,
  onCreated,
}: {
  scenarios: Scenario[];
  threats: Threat[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [threatIds, setThreatIds] = useState<string[]>([]);
  const [riskTolerance, setRiskTolerance] = useState("");
  const [ratings, setRatings] = useState({ il: 3, ii: 3, rl: 2, ri: 2 });
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/risks/suggest-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, threatIds, riskTolerance: riskTolerance ? Number(riskTolerance) : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to suggest ratings");
      setRatings({
        il: data.inherent.likelihood,
        ii: data.inherent.impact,
        rl: data.residual.likelihood,
        ri: data.residual.impact,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to suggest ratings");
    } finally {
      setSuggesting(false);
    }
  }

  async function submit() {
    if (!title || !ownerName || !scenarioId) {
      setError("Title, owner, and scenario are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          ownerName,
          scenarioId,
          threatIds,
          riskTolerance: riskTolerance ? Number(riskTolerance) : null,
          inherentLikelihood: ratings.il,
          inherentImpact: ratings.ii,
          residualLikelihood: ratings.rl,
          residualImpact: ratings.ri,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create risk");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create risk");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Risk" onClose={onClose} wide>
      <div className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-400">Title</span>
          <input className="select" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Unpatched customer database exposure" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-400">Description</span>
          <textarea className="select" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Owner</span>
            <input className="select" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Platform Team" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Risk Tolerance (USD)</span>
            <input
              className="select"
              type="number"
              min={0}
              value={riskTolerance}
              onChange={(e) => setRiskTolerance(e.target.value)}
              placeholder="e.g. 5000000"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
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
            label="Threats"
            placeholder="Baseline"
            options={threats.map((t) => ({ id: t.id, label: t.name }))}
            selected={threatIds}
            onChange={setThreatIds}
          />
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Likelihood / Impact ratings (1-5)</span>
            <button
              onClick={suggest}
              disabled={suggesting}
              className="text-xs px-2.5 py-1 rounded bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50"
            >
              {suggesting ? "Running simulation…" : "Suggest from FAIR model"}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <RatingField label="Inherent Likelihood" value={ratings.il} onChange={(v) => setRatings((r) => ({ ...r, il: v }))} />
            <RatingField label="Inherent Impact" value={ratings.ii} onChange={(v) => setRatings((r) => ({ ...r, ii: v }))} />
            <RatingField label="Residual Likelihood" value={ratings.rl} onChange={(v) => setRatings((r) => ({ ...r, rl: v }))} />
            <RatingField label="Residual Impact" value={ratings.ri} onChange={(v) => setRatings((r) => ({ ...r, ri: v }))} />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Suggestions come from running the FAIR engine at 0% control coverage (inherent) and current average
            coverage (residual) — always editable by hand.
          </p>
        </div>

        {error && <p className="text-sm text-risk">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-accent to-accent2 text-white font-medium text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create Risk"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RatingField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-slate-500">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
