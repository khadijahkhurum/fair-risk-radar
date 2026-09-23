// Audit A2 / WCAG 2.2 1.4.1 (Use of Colour): every pass/fail signal in the
// product was green-vs-red text and nothing else. Colour is not a channel for
// roughly 1 in 12 men, it is lost in a greyscale board pack, and it is lost
// entirely to a screen reader.
//
// This carries the verdict as a WORD, with a glyph as a second redundant
// channel and colour as a third. The glyph is aria-hidden because the word
// beside it already says the same thing — announcing "check mark within
// appetite" is noise, not information.
//
// Full class strings per status, not built by concatenation: Tailwind's
// content scanner only emits classes that appear literally in source.
import type { ReactNode } from "react";

const STATUS = {
  pass: { glyph: "✓", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  fail: { glyph: "✕", className: "border-risk/40 bg-risk/10 text-risk" },
  warn: { glyph: "!", className: "border-amber-400/40 bg-amber-500/10 text-amber-300" },
  neutral: { glyph: "·", className: "border-border bg-white/5 text-slate-300" },
} as const;

export type StatusKind = keyof typeof STATUS;

export function StatusBadge({
  status,
  children,
  className = "",
}: {
  status: StatusKind;
  /** The verdict in words. This is the accessible content — never leave it out. */
  children: ReactNode;
  className?: string;
}) {
  const { glyph, className: tone } = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tone} ${className}`}
    >
      <span aria-hidden="true">{glyph}</span>
      {children}
    </span>
  );
}
