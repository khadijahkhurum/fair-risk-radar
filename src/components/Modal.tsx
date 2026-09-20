"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Portal to <body>: every glass card is its own stacking context now
  // (backdrop-filter does that), so a modal rendered inside a page would be
  // trapped under whichever card sits above it. Body is the only place a
  // fixed overlay is reliably on top.
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[85vh] overflow-y-auto rounded-2xl border border-border glass-thick`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 glass-thick">
          <h3 className="font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
