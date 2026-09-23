"use client";

// Model governance surface for the most recent persisted assessment (audit G4).
//
// The finding was that this surface was empty: no engine version on any
// output, no seed, no parameter change record, no validation evidence, no
// sign-off. Everything except the validation write-up (which lives on the
// Methodology page, because it is prose) is shown here, on the same screen as
// the figure it qualifies.
//
// The deliberate design choice: reproducibility is stated as a fact about THIS
// row, not as a general claim about the tool. "Re-derivable from seed
// <x> against parameter set <y>" is checkable. "Audit-trailed" is marketing.
import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { ROLE_LABEL, atLeast, type Role } from "@/lib/roles";

export interface GovernedAssessment {
  id: string;
  createdAt: string;
  status: "DRAFT" | "APPROVED";
  seed: string;
  trials: number;
  engineVersion: string;
  parameterSetVersion: string;
  parameterSetHash: string;
  reproducible: boolean;
  runBy: { email: string } | null;
  approvedBy: { email: string } | null;
  approvedAt: string | null;
  approvalNote: string | null;
}

export interface Viewer {
  id: string;
  email: string;
  role: Role;
}

// Same rule as src/lib/approval.ts, but this one only decides whether to SHOW
// the button. The server decides whether the approval happens — this cannot
// grant anything, and a user who bypasses it still hits the real check.
function blockedReason(a: GovernedAssessment, viewer: Viewer | null): string | null {
  if (!viewer) return "Sign in to approve.";
  if (!atLeast(viewer.role, "ADMIN")) {
    return `Sign-off is an administrator action. You are signed in as ${ROLE_LABEL[viewer.role]}.`;
  }
  if (a.runBy?.email === viewer.email) {
    return "You ran this assessment, so you cannot also approve it.";
  }
  if (!a.reproducible) {
    return "The model parameters have changed since this ran, so its figures can no longer be re-derived.";
  }
  return null;
}

function utc(iso: string) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

export function AssessmentGovernance({
  assessment,
  viewer,
  onApproved,
}: {
  assessment: GovernedAssessment;
  viewer: Viewer | null;
  onApproved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const approved = assessment.status === "APPROVED";
  const blocked = blockedReason(assessment, viewer);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/risk/${assessment.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Approval failed (${res.status})`);
      setNote("");
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <h3 className="font-semibold text-slate-100">Model governance — latest saved assessment</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Run {utc(assessment.createdAt)}
            {assessment.runBy ? ` by ${assessment.runBy.email}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={approved ? "pass" : "neutral"}>
            {approved ? "Approved" : "Draft — not signed off"}
          </StatusBadge>
          <StatusBadge status={assessment.reproducible ? "pass" : "warn"}>
            {assessment.reproducible ? "Re-derivable" : "Parameters have changed"}
          </StatusBadge>
        </div>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <Field label="Engine version" value={assessment.engineVersion} />
        <Field label="Parameter set" value={assessment.parameterSetVersion} />
        <Field label="Parameter hash" value={assessment.parameterSetHash} mono />
        <Field label="Seed" value={assessment.seed} mono />
        <Field label="Trials" value={assessment.trials.toLocaleString()} />
        {approved && assessment.approvedBy && (
          <>
            <Field label="Approved by" value={assessment.approvedBy.email} />
            <Field label="Approved at" value={assessment.approvedAt ? utc(assessment.approvedAt) : "—"} />
            {assessment.approvalNote && <Field label="Note" value={assessment.approvalNote} />}
          </>
        )}
      </dl>

      <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
        {assessment.reproducible
          ? `Re-running the engine at version ${assessment.engineVersion} with seed ${assessment.seed} and ${assessment.trials.toLocaleString()} trials reproduces these figures exactly. The parameter hash is what attests that the loss distributions, threat multipliers and control cap have not moved since.`
          : `These figures came from a parameter set that is no longer in force, so they cannot be re-derived — the seed alone is not enough once the distributions it samples have changed. Re-run the assessment against the current parameters before relying on it.`}
      </p>

      {!approved && (
        <div className="mt-4 pt-4 border-t border-white/5">
          {blocked ? (
            <p className="text-xs text-slate-400">{blocked}</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <label className="flex-1 flex flex-col gap-1.5">
                <span className="text-xs text-slate-400">Sign-off note (optional)</span>
                <input
                  className="select"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Reviewed against Q3 loss history; accepted for the November board pack."
                />
              </label>
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 whitespace-nowrap"
              >
                {busy ? "Recording…" : "Approve this assessment"}
              </button>
            </div>
          )}
          {error && (
            <p role="status" className="text-xs text-risk mt-2">
              {error}
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-2">
            Approval is immutable and hash-chained into the audit trail. It cannot be given by whoever ran the
            assessment, and it cannot be given once the parameters have moved.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-slate-200 break-all ${mono ? "font-mono text-[11px]" : ""}`}>{value}</dd>
    </div>
  );
}
