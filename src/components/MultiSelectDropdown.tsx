"use client";

// A dropdown button that opens a checkbox list — for picking zero or more
// threat types to layer onto a scenario, without needing N separate toggles
// cluttering the simulator panel.
import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  id: string;
  label: string;
  description?: string;
}

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.label ?? placeholder
        : `${selected.length} threats selected`;

  return (
    <div className="relative" ref={containerRef}>
      <span className="text-xs font-medium text-slate-400 block mb-1.5">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="select flex items-center justify-between text-left"
      >
        <span className={selected.length === 0 ? "text-slate-500" : ""}>{summary}</span>
        <span className="text-slate-500 ml-2">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-surface2 shadow-xl">
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface cursor-pointer border-b border-border/60 last:border-0"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={() => toggle(opt.id)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="block text-sm text-slate-100">{opt.label}</span>
                {opt.description && <span className="block text-xs text-slate-500">{opt.description}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
