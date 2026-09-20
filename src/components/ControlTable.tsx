"use client";

import { useState } from "react";

export interface ControlRow {
  id: string;
  name: string;
  category: string;
  nistCsf: string;
  iso27001: string;
  soc2: string;
  pciDss: string;
  euAiAct: string;
  owaspLlm: string;
  coveragePct?: number;
  coverageSource?: string;
  awsConfigRule?: string | null;
}

export interface FrameworkColumn {
  id: string;
  label: string;
  field: keyof ControlRow;
}

const SOURCE_STYLES: Record<string, string> = {
  MANUAL: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  AWS_CONFIG: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  DEMO: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export function ControlTable({
  rows,
  frameworkColumns,
  editable,
  onOverride,
  onSyncAws,
  syncing,
  onViewEvidence,
}: {
  rows: ControlRow[];
  frameworkColumns: FrameworkColumn[];
  editable: boolean;
  onOverride?: (controlId: string, coveragePct: number) => void;
  onSyncAws?: () => void;
  syncing?: boolean;
  onViewEvidence?: (controlId: string, controlName: string, coveragePct?: number, coverageSource?: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPct, setDraftPct] = useState("");

  const hasAwsRules = rows.some((r) => r.awsConfigRule);
  const columns = frameworkColumns.length > 0 ? frameworkColumns : [{ id: "nist_csf", label: "NIST CSF 2.0", field: "nistCsf" as const }];

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-slate-100">Control Posture</h3>
          <p className="text-sm text-slate-400">
            Mapped to {columns.map((c) => c.label).join(", ")}
          </p>
        </div>
        {editable && hasAwsRules && onSyncAws && (
          <button
            onClick={onSyncAws}
            disabled={syncing}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Syncing…" : "Sync from AWS Config"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-border">
              <th className="px-5 py-3 font-medium sticky left-0 bg-surface">Control</th>
              {columns.map((col) => (
                <th key={col.id} className="px-5 py-3 font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              {editable && <th className="px-5 py-3 font-medium">Coverage</th>}
              {onViewEvidence && <th className="px-5 py-3 font-medium">Evidence</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-3 sticky left-0 bg-surface">
                  <div className="font-medium text-slate-100">{row.name}</div>
                  <div className="text-xs text-slate-500">{row.category}</div>
                </td>
                {columns.map((col) => (
                  <td key={col.id} className="px-5 py-3 text-slate-300 whitespace-nowrap">
                    {row[col.field] === "N/A" ? (
                      <span className="text-slate-600">N/A</span>
                    ) : (
                      String(row[col.field])
                    )}
                  </td>
                ))}
                {editable && (
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 rounded-full bg-surface2 overflow-hidden">
                        <div
                          className="h-full bg-accent2 rounded-full"
                          style={{ width: `${row.coveragePct ?? 0}%` }}
                        />
                      </div>
                      {editingId === row.id ? (
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          max={100}
                          value={draftPct}
                          onChange={(e) => setDraftPct(e.target.value)}
                          onBlur={() => {
                            const pct = Number(draftPct);
                            if (!Number.isNaN(pct) && pct >= 0 && pct <= 100) {
                              onOverride?.(row.id, pct);
                            }
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-16 bg-surface2 border border-border rounded px-1.5 py-0.5 text-slate-100"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(row.id);
                            setDraftPct(String(row.coveragePct ?? 0));
                          }}
                          title="Click to override this control's coverage %"
                          className="tabular-nums text-slate-200 hover:text-accent2 underline decoration-dotted decoration-slate-600 underline-offset-4 transition-colors"
                        >
                          {(row.coveragePct ?? 0).toFixed(0)}%
                        </button>
                      )}
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                          SOURCE_STYLES[row.coverageSource ?? "DEMO"]
                        }`}
                      >
                        {row.coverageSource ?? "DEMO"}
                      </span>
                    </div>
                  </td>
                )}
                {onViewEvidence && (
                  <td className="px-5 py-3">
                    <button
                      onClick={() => onViewEvidence(row.id, row.name, row.coveragePct, row.coverageSource)}
                      className="text-sm text-accent hover:text-accent2 transition-colors"
                    >
                      View
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
