"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Risk Simulator" },
  { href: "/controls", label: "Control Posture" },
  { href: "/risks", label: "Risk Register" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-surface px-6 py-8 shrink-0">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent2" />
          <span className="font-semibold text-lg tracking-tight">FAIR Risk Radar</span>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded-lg transition-colors ${
                pathname === href
                  ? "bg-surface2 text-slate-100 font-medium"
                  : "text-slate-400 hover:text-slate-100 hover:bg-surface2"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto text-xs text-slate-500 leading-relaxed">
          Quantitative FAIR model · compliance-as-code · audit-trailed
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 lg:px-10 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  );
}
