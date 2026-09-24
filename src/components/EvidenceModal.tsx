"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { StatusBadge } from "./StatusBadge";
import type { EvidenceFinding, DroppedFinding } from "@/lib/ai/evidence-review";

type ReviewState =
  | { status: "running" }
  | { status: "error"; message: string }
  | {
      status: "done";
      findings: EvidenceFinding[];
      dropped: DroppedFinding[];
      model: string;
      truncated: boolean;
      claimedCoveragePct: number;
    };

interface EvidenceRow {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  summary: string;
  parsedRows: Record<string, string>[] | null;
  rawText: string;
  uploadedAt: string;
}

export function EvidenceModal({
  controlId,
  controlName,
  coveragePct,
  coverageSource,
  onClose,
}: {
  controlId: string;
  controlName: string;
  coveragePct?: number;
  coverageSource?: string;
  onClose: () => void;
}) {
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI reconciliation state, keyed by evidence id — the modal can show several
  // files, and a review belongs to one of them.
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch(`/api/controls/${controlId}/evidence`);
    const data = await res.json();
    if (res.ok) setEvidence(data.evidence);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is redefined every render;
    // the real dependency is controlId, and adding `load` here would loop.
  }, [controlId]);

  async function runReview(evidenceId: string) {
    setReviewing(evidenceId);
    setReviews((r) => ({ ...r, [evidenceId]: { status: "running" } }));
    try {
      const res = await fetch(`/api/evidence/${evidenceId}/review`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Analysis failed (${res.status})`);
      setReviews((r) => ({
        ...r,
        [evidenceId]: {
          status: "done",
          findings: data.findings ?? [],
          dropped: data.dropped ?? [],
          model: data.review?.model ?? "unknown",
          truncated: Boolean(data.review?.truncated),
          claimedCoveragePct: data.review?.claimedCoveragePct ?? 0,
        },
      }));
    } catch (err) {
      setReviews((r) => ({
        ...r,
        [evidenceId]: { status: "error", message: err instanceof Error ? err.message : "Analysis failed" },
      }));
    } finally {
      setReviewing(null);
    }
  }

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/controls/${controlId}/evidence`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Modal title={`Evidence — ${controlName}`} onClose={onClose} wide>
      {coveragePct !== undefined && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface2/40 px-4 py-2.5 mb-4 text-sm">
          <span className="text-slate-400">
            Current coverage: <span className="text-slate-100 font-medium">{coveragePct.toFixed(0)}%</span>
            {coverageSource && <span className="text-slate-500"> ({coverageSource})</span>}
          </span>
          <span className="text-xs text-slate-500">
            {evidence.length} file{evidence.length === 1 ? "" : "s"} on record
          </span>
        </div>
      )}

      <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-accent/50 px-4 py-4 cursor-pointer transition-colors mb-4">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
        <span className="text-sm text-slate-400">
          {uploading ? "Parsing…" : "Click to attach a .csv or .txt evidence file"}
        </span>
      </label>
      {error && <p className="text-sm text-risk mb-4">{error}</p>}

      {evidence.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm text-slate-400 mb-1">No evidence attached yet.</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Attach the artifact an auditor would ask for — an access-review export, a patch-compliance report, or an
            incident-response test log — as a .csv or .txt file. It&apos;s parsed and stored here permanently, building an
            audit trail over time.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {evidence.map((e) => (
            <div key={e.id} className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface2 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100">{e.filename}</div>
                  <div className="text-xs text-slate-500">
                    {e.summary} · {new Date(e.uploadedAt).toLocaleString()}
                  </div>
                </div>
                <span className="text-slate-500 text-xs">{expandedId === e.id ? "Hide" : "View"}</span>
              </button>
              {expandedId === e.id && (
                <div className="border-t border-border p-4 bg-surface2/50">
                  {e.parsedRows && e.parsedRows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-border">
                            {Object.keys(e.parsedRows[0]).map((col) => (
                              <th key={col} className="pr-4 py-1.5 font-medium">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {e.parsedRows.map((row, i) => (
                            <tr key={i} className="border-b border-border/40 last:border-0">
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="pr-4 py-1.5 text-slate-300">
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap">{e.rawText}</pre>
                  )}

                  <ReviewPanel
                    state={reviews[e.id]}
                    busy={reviewing === e.id}
                    coveragePct={coveragePct}
                    onRun={() => runReview(e.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/**
 * The reconciliation panel.
 *
 * Two things here are deliberate and worth defending:
 *
 *  • Every finding shows its VERBATIM QUOTE from the evidence, not just the
 *    model's prose. The quote is what was verified; showing the conclusion
 *    without the grounding would hide the one thing that makes the finding
 *    checkable.
 *
 *  • The discard count is shown. "3 findings, 2 discarded as ungrounded" tells
 *    an analyst how much to trust the 3. Hiding it would make the feature look
 *    more reliable than it is, which is the opposite of the point.
 *
 * A suggested coverage percentage is rendered as text next to a reminder that
 * nothing applies it. There is deliberately no button here that writes it —
 * coverage changes go through the CONTROL_OWNER path, by hand.
 */
function ReviewPanel({
  state,
  busy,
  coveragePct,
  onRun,
}: {
  state: ReviewState | undefined;
  busy: boolean;
  coveragePct?: number;
  onRun: () => void;
}) {
  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div>
          <span className="text-xs font-medium text-slate-300">Reconcile against claimed coverage</span>
          <p className="text-[11px] text-slate-500 mt-0.5">
            An assisted read of this file against the {coveragePct ?? 0}% claimed for this control. Findings are
            suggestions for you to judge — nothing here changes coverage.
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="text-xs px-2.5 py-1 rounded bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "Analysing…" : "Analyse"}
        </button>
      </div>

      {state?.status === "error" && (
        <p role="status" className="text-xs text-risk mt-2">
          {state.message}
        </p>
      )}

      {state?.status === "done" && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
            <StatusBadge status={state.findings.length > 0 ? "warn" : "pass"}>
              {state.findings.length === 0
                ? "No contradictions found"
                : `${state.findings.length} finding${state.findings.length === 1 ? "" : "s"}`}
            </StatusBadge>
            {state.dropped.length > 0 && (
              <span title="Model output that could not be grounded in this file, and was discarded before display.">
                {state.dropped.length} discarded as ungrounded
              </span>
            )}
            {state.truncated && <span className="text-amber-300">file truncated for analysis</span>}
            <span className="font-mono">{state.model}</span>
          </div>

          {state.findings.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <StatusBadge status={f.severity === "contradiction" ? "fail" : f.severity === "gap" ? "warn" : "neutral"}>
                  {f.severity}
                </StatusBadge>
                {f.rowRefs && f.rowRefs.length > 0 && (
                  <span className="text-[11px] text-slate-500">
                    row{f.rowRefs.length === 1 ? "" : "s"} {f.rowRefs.join(", ")}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-200">{f.observed}</p>
              <p className="text-[11px] text-slate-500 mt-1">Against the claim: {f.claim}</p>
              <pre className="text-[11px] text-slate-400 mt-2 p-2 rounded bg-surface2 whitespace-pre-wrap break-all">
                {f.quote}
              </pre>
              {f.suggestedCoveragePct !== null && f.suggestedCoveragePct !== undefined && (
                <p className="text-[11px] text-slate-500 mt-2">
                  Suggests {f.suggestedCoveragePct}% coverage.{" "}
                  <span className="text-slate-600">
                    Not applied — a control owner changes coverage, this does not.
                  </span>
                </p>
              )}
            </div>
          ))}

          <p className="text-[11px] text-slate-600">
            Generated by a language model and not reproducible: the same file may produce different findings on a
            later run. Every finding above quotes this file verbatim; anything that could not be matched to the file
            was discarded rather than shown.
          </p>
        </div>
      )}
    </div>
  );
}
