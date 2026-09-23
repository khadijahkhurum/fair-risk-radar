"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { SelectDropdown } from "@/components/SelectDropdown";
import { RiskHeatmap, type HeatmapPoint } from "@/components/RiskHeatmap";
import { riskScoreLabel, ALE_BANDS, PROBABILITY_BANDS, aleBandLabel, probabilityBandLabel } from "@/lib/risk-rating";
import { isOverridden, overrideLabel } from "@/lib/risk-governance";
import { StatusBadge } from "@/components/StatusBadge";

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
  // G7: the model's proposal, kept beside the human's answer.
  suggestedInherentLikelihood: number | null;
  suggestedInherentImpact: number | null;
  suggestedResidualLikelihood: number | null;
  suggestedResidualImpact: number | null;
  overrideJustification: string | null;
  // G8: resolved through the owner directory, so an erased name never
  // reaches the client at all.
  ownerId: string;
  ownerErased: boolean;
  latestAssessment: { meanAle: number } | null;
  createdAt: string;
}

// G7: "Overridden — model suggests 3x4", derived from the stored suggestion.
function overrideNoteFor(r: Risk): string | null {
  const inherent =
    r.suggestedInherentLikelihood !== null && r.suggestedInherentImpact !== null
      ? { likelihood: r.suggestedInherentLikelihood, impact: r.suggestedInherentImpact }
      : null;
  const residual =
    r.suggestedResidualLikelihood !== null && r.suggestedResidualImpact !== null
      ? { likelihood: r.suggestedResidualLikelihood, impact: r.suggestedResidualImpact }
      : null;
  if (isOverridden({ likelihood: r.inherentLikelihood, impact: r.inherentImpact }, inherent)) {
    return `Inherent ${overrideLabel(inherent)?.replace("Overridden — model suggests ", "overridden, model suggests ")}`;
  }
  if (isOverridden({ likelihood: r.residualLikelihood, impact: r.residualImpact }, residual)) {
    return `Residual ${overrideLabel(residual)?.replace("Overridden — model suggests ", "overridden, model suggests ")}`;
  }
  return null;
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
    const res = await fetch("/api/risks", { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setRisks(data.risks);
    else setLoadError(data.error ?? "Failed to load risk register");
  }

  useEffect(() => {
    fetch("/api/scenarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setScenarios(data.scenarios);
        setThreats(data.threats);
      });
    loadRisks();
  }, []);

  async function updateStatus(id: string, status: Risk["status"]) {
    // P1's principle: a failed update used to do nothing at all, leaving the
    // old status on screen as though the change had been rejected silently.
    // That matters more now that G7 gives this endpoint a 422 of its own.
    setLoadError(null);
    try {
      const res = await fetch(`/api/risks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Update failed (${res.status})`);
      loadRisks();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not update this risk");
      // Re-read so the dropdown snaps back to the stored value rather than
      // showing a status the server never accepted.
      loadRisks();
    }
  }

  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (selectedRiskId) {
      rowRefs.current[selectedRiskId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedRiskId]);

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
          className="btn-primary shrink-0"
        >
          + New Risk
        </button>
      </header>

      {/* G7: "Impact 4" meant nothing without this. An ordinal a reader cannot
          decode cannot be defended or compared across risks, which is the very
          objection the Methodology page raises against qualitative registers.
          The bands are judgement calls, not a standard — the provenance
          register says so — but they are now judgement calls you can check. */}
      <details className="rounded-xl border border-border bg-surface p-4 mb-6">
        <summary className="cursor-pointer text-sm font-medium text-slate-200">
          How the 1&ndash;5 ratings map to model output
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">Impact &mdash; from annualised loss expectancy</h4>
            <table className="w-full text-[13px]">
              <caption className="sr-only">Impact rating bands by annualised loss expectancy</caption>
              <tbody>
                {ALE_BANDS.map((b) => (
                  <tr key={b.rating} className="border-b border-white/5">
                    <th scope="row" className="py-1.5 pr-4 text-left font-mono text-slate-200">
                      Impact {b.rating}
                    </th>
                    <td className="py-1.5 text-slate-400">{aleBandLabel(b.rating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">
              Likelihood &mdash; from P(annual loss &gt; tolerance)
            </h4>
            <table className="w-full text-[13px]">
              <caption className="sr-only">Likelihood rating bands by probability of exceeding tolerance</caption>
              <tbody>
                {PROBABILITY_BANDS.map((b) => (
                  <tr key={b.rating} className="border-b border-white/5">
                    <th scope="row" className="py-1.5 pr-4 text-left font-mono text-slate-200">
                      Likelihood {b.rating}
                    </th>
                    <td className="py-1.5 text-slate-400">{probabilityBandLabel(b.rating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Inherent ratings come from running the engine at 0% control coverage; residual ratings from today&apos;s
          coverage. Both are suggestions, always editable &mdash; but an edit that diverges from the model is recorded
          as an override and has to carry a reason.
        </p>
      </details>

      {loadError && (
        <div className="mb-6 rounded-lg border border-risk/30 bg-risk/10 text-risk px-4 py-3 text-sm">{loadError}</div>
      )}

      {risks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 rounded-xl border border-border bg-surface p-5">
          <RiskHeatmap
            title="Inherent Risk (before controls)"
            points={inherentPoints}
            selectedId={selectedRiskId}
            onSelectPoint={setSelectedRiskId}
          />
          <RiskHeatmap
            title="Residual Risk (after controls)"
            points={residualPoints}
            selectedId={selectedRiskId}
            onSelectPoint={setSelectedRiskId}
          />
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
                    <tr
                      key={r.id}
                      ref={(el) => {
                        rowRefs.current[r.id] = el;
                      }}
                      onClick={() => setSelectedRiskId(r.id === selectedRiskId ? null : r.id)}
                      className={`border-b border-border/60 last:border-0 cursor-pointer transition-colors ${
                        r.id === selectedRiskId ? "bg-accent/10 ring-1 ring-inset ring-accent2/40" : "hover:bg-surface2/60"
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-100">{r.title}</div>
                        <div className="text-xs text-slate-500">{r.description}</div>
                        {/* G7: a score that disagrees with the model has to say so
                            where the score is read. Otherwise the heatmap and the
                            ALE can contradict each other silently — the exact
                            failure the Methodology page argues FAIR avoids. */}
                        {overrideNoteFor(r) && (
                          <div className="mt-1.5 flex items-start gap-1.5 flex-wrap">
                            <StatusBadge status="warn">{overrideNoteFor(r)}</StatusBadge>
                            {r.overrideJustification && (
                              <span className="text-[11px] text-slate-400 max-w-md">
                                {r.overrideJustification}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        {r.ownerErased ? (
                          <span className="italic text-slate-500" title="This owner's name has been erased on request.">
                            {r.ownerName}
                          </span>
                        ) : (
                          r.ownerName
                        )}
                      </td>
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
  // G7: what the MODEL proposed, held separately from what the user may then
  // change it to. Without this the two are indistinguishable once saved.
  const [suggested, setSuggested] = useState<{ il: number; ii: number; rl: number; ri: number } | null>(null);
  const [justification, setJustification] = useState("");
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
      const proposal = {
        il: data.inherent.likelihood,
        ii: data.inherent.impact,
        rl: data.residual.likelihood,
        ri: data.residual.impact,
      };
      setRatings(proposal);
      setSuggested(proposal);
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
          suggestedInherentLikelihood: suggested?.il ?? null,
          suggestedInherentImpact: suggested?.ii ?? null,
          suggestedResidualLikelihood: suggested?.rl ?? null,
          suggestedResidualImpact: suggested?.ri ?? null,
          overrideJustification: justification.trim() || null,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectDropdown
            label="Scenario"
            options={scenarios.map((s) => ({ id: s.id, label: s.name }))}
            value={scenarioId}
            onChange={setScenarioId}
          />
          <MultiSelectDropdown
            label="Threats"
            placeholder="Baseline"
            itemNoun="threats"
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <RatingField label="Inherent Likelihood" value={ratings.il} onChange={(v) => setRatings((r) => ({ ...r, il: v }))} />
            <RatingField label="Inherent Impact" value={ratings.ii} onChange={(v) => setRatings((r) => ({ ...r, ii: v }))} />
            <RatingField label="Residual Likelihood" value={ratings.rl} onChange={(v) => setRatings((r) => ({ ...r, rl: v }))} />
            <RatingField label="Residual Impact" value={ratings.ri} onChange={(v) => setRatings((r) => ({ ...r, ri: v }))} />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Suggestions come from running the FAIR engine at 0% control coverage (inherent) and current average
            coverage (residual) — always editable by hand.
          </p>

          {/* G7: the justification box appears only once the human value has
              actually diverged. Demanding a reason to AGREE with the model
              would train people to type "ok" into a mandatory field, which is
              worse than having no field. The server enforces the same rule —
              this is the prompt, not the control. */}
          {suggested &&
            (isOverridden({ likelihood: ratings.il, impact: ratings.ii }, { likelihood: suggested.il, impact: suggested.ii }) ||
              isOverridden({ likelihood: ratings.rl, impact: ratings.ri }, { likelihood: suggested.rl, impact: suggested.ri })) && (
              <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <StatusBadge status="warn">Diverges from the model</StatusBadge>
                  <span className="text-[11px] text-slate-400">
                    Model suggests inherent {suggested.il}&times;{suggested.ii}, residual {suggested.rl}&times;
                    {suggested.ri}.
                  </span>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-300">
                    Why does your judgement differ? (required)
                  </span>
                  <textarea
                    className="select min-h-[64px]"
                    value={justification}
                    maxLength={2000}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="e.g. A contractual indemnity caps our exposure below what the loss model assumes."
                  />
                </label>
              </div>
            )}
        </div>

        {error && <p className="text-sm text-risk">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="btn-primary"
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
