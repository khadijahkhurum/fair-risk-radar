"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
