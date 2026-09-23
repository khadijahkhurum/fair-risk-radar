"use client";

// Audit Trail — now with the thing that made it an audit trail (G1): an actor
// on every event, and a verifiable hash chain (S6).
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ROLE_LABEL, type Role } from "@/lib/roles";

// One taxonomy, shared with the server. Record<AuditKind, ...> below now
// FAILS TO COMPILE if a kind is added without a style — which is the guard
// that was missing when ERASURE was added.
import { AUDIT_KINDS, type AuditKind } from "@/lib/audit-kinds";

interface AuditEvent {
  id: string;
  kind: AuditKind;
  at: string;
  actorEmail: string;
  actorRole: Role;
  detail: Record<string, unknown>;
  hash: string;
}
interface Integrity {
  verified: boolean;
  brokenAtIndex: number | null;
  eventsChecked: number;
}
type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; events: AuditEvent[]; integrity: Integrity };

const KIND_STYLE: Record<AuditKind, { label: string; dot: string; chip: string }> = {
  SIMULATION: { label: "Simulation", dot: "bg-accent", chip: "border-accent/40 text-accent2" },
  COVERAGE: { label: "Coverage", dot: "bg-amber-400", chip: "border-amber-400/40 text-amber-400" },
  EVIDENCE: { label: "Evidence", dot: "bg-emerald-400", chip: "border-emerald-500/40 text-emerald-400" },
  RISK: { label: "Risk", dot: "bg-risk", chip: "border-risk/40 text-risk" },
  AUTH: { label: "Sign-in", dot: "bg-slate-400", chip: "border-border text-slate-400" },
  APPROVAL: { label: "Sign-off", dot: "bg-violet-400", chip: "border-violet-400/40 text-violet-300" },
  ERASURE: { label: "Erasure", dot: "bg-slate-300", chip: "border-slate-300/40 text-slate-200" },
};
const KINDS: readonly AuditKind[] = AUDIT_KINDS;

const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

// G5: UTC is authoritative and always shown; local time is the parenthetical.
// Two auditors in different offices previously saw different times for the
// same record with no offset marker to tell them which was which.
function stamps(iso: string) {
  const d = new Date(iso);
  return {
    utc: `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`,
    local: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
  };
}

/** One line per fact, so the detail stays filterable rather than becoming prose (G1). */
function DetailGrid({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500 font-mono">{k}</dt>
          <dd className="text-slate-300 font-mono break-all">
            {typeof v === "number" && /ale|tolerance|loss/i.test(k) ? money(v) : JSON.stringify(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function AuditPage() {
  const [state, setState] = useState<Load>({ status: "loading" });
  // Copied, not referenced: KINDS is the immutable catalogue (it comes from an
  // `as const` tuple), while `active` is a mutable selection the filter chips
  // add to and remove from. Spreading is the correct relationship between the
  // two, not a workaround for the readonly type.
  const [active, setActive] = useState<AuditKind[]>([...KINDS]);

  // P1: a failed fetch must never render as an empty trail. In a risk tool,
  // silence reads as "no risk".
  useEffect(() => {
    fetch("/api/audit", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
        setState({ status: "ok", events: data.events ?? [], integrity: data.integrity });
      })
      .catch((e: unknown) =>
        setState({ status: "error", message: e instanceof Error ? e.message : "Could not load the audit trail" })
      );
  }, []);

  const events = useMemo(() => (state.status === "ok" ? state.events : []), [state]);
  const shown = useMemo(() => events.filter((e) => active.includes(e.kind)), [events, active]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="text-slate-400 mt-1">
          Every simulation, coverage change, evidence upload, risk edit and sign-in — who did it, when, and to what.
          Records are appended, never edited, and each one is hash-chained to the one before it.
        </p>
      </header>

      {state.status === "ok" && (
        <div
          className={`rounded-xl border p-4 mb-6 text-sm ${
            state.integrity.verified
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-risk/50 bg-risk/10"
          }`}
        >
          <span className={`font-semibold ${state.integrity.verified ? "text-emerald-400" : "text-risk"}`}>
            {state.integrity.verified ? "Chain verified. " : "Chain broken. "}
          </span>
          <span className="text-slate-300">
            {state.integrity.verified
              ? `All ${state.integrity.eventsChecked} events re-hashed on load and match their recorded chain. Altering or removing any past record would break this check — including by someone with database access.`
              : `Re-hashing failed at event index ${state.integrity.brokenAtIndex}. A record has been altered or removed since it was written.`}
          </span>
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-xl border border-risk/40 bg-risk/10 p-4 mb-6 text-sm">
          <span className="font-semibold text-risk">Could not load the audit trail. </span>
          <span className="text-slate-300">{state.message}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-3 text-xs px-2.5 py-1 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {KINDS.map((k) => {
          const on = active.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setActive((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))}
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
        {state.status === "loading" ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">
            {state.status === "error"
              ? "Nothing shown — the trail could not be loaded. This is not the same as an empty trail."
              : events.length === 0
              ? "No events recorded yet. Run a simulation or change a control's coverage and it will appear here."
              : "No events match the selected filters."}
          </p>
        ) : (
          <ol className="relative">
            <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-white/10" />
            {shown.map((e) => {
              const t = stamps(e.at);
              return (
                <li key={e.id} className="relative pl-7 pb-5 last:pb-0">
                  <span
                    aria-hidden
                    className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ${KIND_STYLE[e.kind].dot} ring-4 ring-surface`}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-slate-100">{e.actorEmail}</span>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${KIND_STYLE[e.kind].chip}`}>
                      {KIND_STYLE[e.kind].label}
                    </span>
                    <span className="text-[11px] text-slate-500">{ROLE_LABEL[e.actorRole]}</span>
                    <span className="text-[11px] text-slate-500 font-mono" title={`Local: ${t.local}`}>
                      {t.utc}
                    </span>
                  </div>
                  <DetailGrid detail={e.detail} />
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="text-[11px] text-slate-500 mt-4">
        Showing the most recent {shown.length} of {events.length} loaded events. Timestamps are UTC; hover for local
        time.
      </p>
    </AppShell>
  );
}
