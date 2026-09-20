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
    <div className="min-h-screen flex gap-0 lg:gap-2 p-0 lg:p-3">
      {/* Floating glass sidebar — detached from the window edge so the ambient
          background shows through and around it, which is what makes the
          material read as glass rather than as a tinted panel. */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col px-3 py-6 rounded-2xl border border-border bg-surface sticky top-3 h-[calc(100vh-1.5rem)]">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_-4px_rgba(10,132,255,0.8)]">
            <span className="font-mono text-[11px] font-semibold text-white">FR</span>
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-slate-100">FAIR Risk Radar</span>
        </div>

        <nav className="flex flex-col gap-1 text-[13px]">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-3 py-2 rounded-lg ${
                  active ? "text-slate-100 font-medium" : "text-slate-400 hover:text-slate-100"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-lg bg-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.20)]"
                  />
                )}
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-2 text-[11px] text-slate-600 leading-relaxed">
          Quantitative FAIR model · compliance-as-code · audit-trailed
        </div>
      </aside>

      {/* key on pathname so the entrance choreography replays on every route
          change instead of only on first load. */}
      <main key={pathname} className="flex-1 px-6 py-8 lg:px-12 lg:py-10 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
