"use client";

import { useRef, useState } from "react";
import type { NormalizedControl } from "@/lib/catalog-parser";

export function UploadCatalogPanel({
  onLoaded,
  onCleared,
  active,
}: {
  onLoaded: (controls: NormalizedControl[], filename: string) => void;
  onCleared: () => void;
  active: { filename: string; count: number } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/controls/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onLoaded(data.controls, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="font-semibold text-slate-100 mb-1">Bring Your Own Catalog</h3>
      <p className="text-sm text-slate-400 mb-4">
        Upload a .yaml or .csv control catalog to view it mapped against every framework. Shown in
        this session only — nothing is written to the shared database.
      </p>

      {active ? (
        <div className="flex items-center justify-between rounded-lg bg-surface2 border border-border px-4 py-3">
          <div className="text-sm">
            <span className="font-medium text-accent2">{active.filename}</span>
            <span className="text-slate-400"> — {active.count} controls loaded</span>
          </div>
          <button
            onClick={() => {
              onCleared();
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Clear
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-accent/50 px-4 py-8 cursor-pointer transition-colors">
          <input
            ref={inputRef}
            type="file"
            accept=".yaml,.yml,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <span className="text-sm text-slate-400">
            {loading ? "Parsing…" : "Click to upload a .yaml or .csv catalog"}
          </span>
        </label>
      )}

      {error && <p className="mt-3 text-sm text-risk">{error}</p>}
    </div>
  );
}
