"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Risk Simulator" },
  { href: "/controls", label: "Control Posture" },
  { href: "/risks", label: "Risk Register" },
  { href: "/roi", label: "ROI Analysis" },
];

const STORAGE_KEY = "frr-sidebar-open";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // AppShell remounts on every route change (each page wraps itself in it),
  // so the open/closed choice has to live outside React or it resets on every
  // click. localStorage is the whole persistence layer this needs.
  const [open, setOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved !== null) setOpen(saved === "1");
    setHydrated(true);
  }, []);

  function toggle() {
    setOpen((v) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      } catch {
        // private mode / storage disabled — the toggle still works this session
      }
      return !v;
    });
  }

  return (
    <div className="min-h-screen flex lg:gap-2 lg:p-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Collapse navigation" : "Open navigation"}
        aria-expanded={open}
        className="fixed top-4 left-4 z-[60] w-9 h-9 rounded-lg border border-border glass-thick flex flex-col items-center justify-center gap-[3px] hover:bg-white/10"
      >
        {/* Burger that morphs into an X — the bars are the same three
            elements, just rotated and faded. */}
        <span
          className={`block h-[1.5px] w-4 bg-slate-200 transition-transform duration-300 ${
            open ? "translate-y-[4.5px] rotate-45" : ""
          }`}
        />
        <span className={`block h-[1.5px] w-4 bg-slate-200 transition-opacity duration-200 ${open ? "opacity-0" : ""}`} />
        <span
          className={`block h-[1.5px] w-4 bg-slate-200 transition-transform duration-300 ${
            open ? "-translate-y-[4.5px] -rotate-45" : ""
          }`}
        />
      </button>

      {/* Scrim, small screens only: there the sidebar overlays content. */}
      {open && hydrated && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={toggle} aria-hidden />
      )}

      <aside
        className={`fixed lg:sticky z-50 lg:z-auto left-0 top-0 lg:top-3 h-screen lg:h-[calc(100vh-1.5rem)]
          shrink-0 flex flex-col overflow-hidden border border-border bg-surface rounded-none lg:rounded-2xl
          ${hydrated ? "transition-[width,transform,opacity,padding] duration-300" : ""}
          ${
            open
              ? "w-60 px-3 pt-16 pb-6 translate-x-0 opacity-100"
              : "w-60 lg:w-0 px-3 lg:px-0 pt-16 pb-6 -translate-x-full lg:translate-x-0 opacity-0 border-transparent"
          }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
        aria-hidden={!open}
      >
        <div className="flex items-center gap-2.5 mb-6 px-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_-4px_rgba(10,132,255,0.8)]">
            <span className="font-mono text-[11px] font-semibold text-white">FR</span>
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-slate-100 whitespace-nowrap">
            FAIR Risk Radar
          </span>
        </div>

        <nav className="flex flex-col gap-1 text-[13px]">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                tabIndex={open ? 0 : -1}
                className={`relative px-3 py-2 rounded-lg whitespace-nowrap ${
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

      {/* key on pathname so the entrance choreography replays on navigation.
          pl-16 keeps the first heading clear of the floating burger. */}
      <main key={pathname} className="flex-1 min-w-0 pl-16 pr-6 py-8 lg:pr-12 lg:py-10 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
