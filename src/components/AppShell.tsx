"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Risk Simulator" },
  { href: "/controls", label: "Control Posture" },
  { href: "/risks", label: "Risk Register" },
  { href: "/roi", label: "ROI Analysis" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex">
      {/* Translucent, blurred sidebar — the macOS sidebar material, which is
          what reads as "native app" rather than "web dashboard". */}
      <aside className="hidden lg:flex w-64 flex-col shrink-0 px-4 py-7 bg-white/[0.04] backdrop-blur-2xl border-r border-white/[0.06]">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shadow-card">
            <span className="font-mono text-[11px] font-semibold text-white">FR</span>
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-slate-100">FAIR Risk Radar</span>
        </div>
        <nav className="flex flex-col gap-0.5 text-[13px]">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-[7px] rounded-lg transition-colors ${
                pathname === href
                  ? "bg-white/[0.10] text-slate-100 font-medium"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2 text-[11px] text-slate-600 leading-relaxed">
          Quantitative FAIR model · compliance-as-code · audit-trailed
        </div>
      </aside>

      <main className="flex-1 px-6 py-10 lg:px-12 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  );
}
