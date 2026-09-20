"use client";

// Audit Trail — the evidence that the numbers elsewhere in this tool were not
// made up this morning. Every simulation, coverage change, evidence upload and
// registered risk, in one reverse-chronological record.
//
// This is the page an auditor opens first, and the reason the underlying
// tables are append-only: coverage is never overwritten, so the history of
// what was claimed and when survives even when the current figure changes.
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";

type AuditKind = "SIMULATION" | "COVERAGE" | "EVIDENCE" | "RISK";

interface AuditEvent {
  id: string;
  kind: AuditKind;
  at: string;
  title: string;
  detail: string;
  tag?: string;
}

const KIND_STYLE: Record<AuditKind, { label: string; dot: string; chip: string }> = {
  SIMULATION: { label: "Simulation", dot: "bg-accent", chip: "border-accent/40 text-accent2" },
  COVERAGE: { label: "Coverage", dot: "bg-amber-400", chip: "border-amber-400/40 text-amber-400" },
  EVIDENCE: { label: "Evidence", dot: "bg-emerald-400", chip: "border-emerald-500/40 text-emerald-400" },
  RISK: { label: "Risk", dot: "bg-risk", chip: "border-risk/40 text-risk" },
};
const KINDS: AuditKind[] = ["SIMULATION", "COVERAGE", "EVIDENCE", "RISK"];

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  const rel =
    mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
  return { absolute: d.toLocaleString(), relative: rel };
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [active, setActive] = useState<AuditKind[]>(KINDS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/audit", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEvents(data.events ?? []);
      })
      .catch(() => setLoadError("Failed to load the audit trail"))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => events.filter((e) => active.includes(e.kind)), [events, active]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  function toggle(kind: AuditKind) {
    setActive((a) => (a.includes(kind) ? a.filter((k) => k !== kind) : [...a, kind]));
  }

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="text-slate-400 mt-1">
          Every simulation, coverage change, evidence upload and registered risk, in the order it happened. Records are
          appended, never edited — a superseded coverage figure stays in the history.
        </p>
      </header>

      {loadError && <div className="mb-6 rounded-lg border border-risk/30 bg-risk/10 text-risk px-4 py-3 text-sm">{loadError}</div>}

      <div className="flex flex-wrap gap-2 mb-6">
        {KINDS.map((k) => {
          const on = active.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={on}
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                on ? `${KIND_STYLE[k].chip} bg-white/[0.06]` : "border-border text-slate-500"
              }`}
            >
              {KIND_STYLE[k].label}
              <span className="ml-1.5 font-mono text-slate-500">{counts[k] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading trail…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">
            {events.length === 0
              ? "Nothing recorded yet. Run a simulation or change a control coverage figure and it will appear here."
              : "No events match the selected filters."}
          </p>
        ) : (
          <ol className="relative">
            {/* the spine */}
            <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-white/10" />
            {shown.map((e) => {
              const t = when(e.at);
              return (
                <li key={e.id} className="relative pl-7 pb-5 last:pb-0">
                  <span
                    aria-hidden
                    className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ${KIND_STYLE[e.kind].dot} ring-4 ring-surface`}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-slate-100">{e.title}</span>
                    {e.tag && (
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${KIND_STYLE[e.kind].chip}`}>
                        {e.tag}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 font-mono" title={t.absolute}>
                      {t.relative}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">{e.detail}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="text-[11px] text-slate-500 mt-4">
        Showing the most recent records per category. Coverage history is retained in full in the database — this view
        is a window onto it, not the record itself.
      </p>
    </AppShell>
  );
}
