"use client";

// Single-select twin of MultiSelectDropdown. A native <select> can't be made
// to match it — the option list is drawn by the OS, not the page — so the two
// controls sitting side by side will never look like one design system unless
// both are ours. Same trigger, same glass panel, same open/close behaviour.
import { useEffect, useRef, useState } from "react";

export function SelectDropdown({
  label,
  options,
  value,
  onChange,
  placeholder = "Select",
}: {
  label?: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const current = options.find((o) => o.id === value);

  return (
    <div className={`relative ${open ? "z-40" : ""}`} ref={containerRef}>
      {label && <span className="text-xs font-medium text-slate-400 block mb-1.5">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="select flex items-center justify-between text-left"
      >
        <span className={current ? "" : "text-slate-500"}>{current?.label ?? placeholder}</span>
        <span className="text-slate-500 ml-2">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border glass-thick"
        >
          {options.map((opt) => {
            const selected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm border-b border-border/60 last:border-0 hover:bg-white/[0.07] ${
                  selected ? "text-slate-100 font-medium bg-white/[0.05]" : "text-slate-300"
                }`}
              >
                <span>{opt.label}</span>
                {selected && <span className="text-accent2 text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
