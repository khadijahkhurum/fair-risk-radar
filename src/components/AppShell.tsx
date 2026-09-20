"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Inline SVGs rather than an icon package — four glyphs is not worth a
// dependency, and these are the only ones this app will ever need.
function IconSimulator() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-[18px] h-[18px]">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
function IconControls() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IconRegister() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-[18px] h-[18px]">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}
function IconRoi() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M3 17l5-5 4 3 8-8" />
      <path d="M16 7h4v4" />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Risk Simulator", Icon: IconSimulator },
  { href: "/controls", label: "Control Posture", Icon: IconControls },
  { href: "/risks", label: "Risk Register", Icon: IconRegister },
  { href: "/roi", label: "ROI Analysis", Icon: IconRoi },
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

  function persist(next: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // private mode / storage disabled — the toggle still works this session
    }
  }

  function toggle() {
    setOpen((v) => {
      persist(!v);
      return !v;
    });
  }

  // Collapse after navigating. On phones the panel covers the page, so
  // leaving it open would hide whatever you just navigated to; on desktop it
  // drops to the icon rail, so nav is still one click away and the page gets
  // its width back — which is the point of collapsing it at all.
  function closeAfterNav() {
    setOpen(false);
    persist(false);
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
      {open && hydrated && <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={toggle} aria-hidden />}

      {/* Collapsed on desktop is an icon RAIL, not a disappearance — nav stays
          one click away. On small screens it still slides fully off-canvas,
          because a 64px rail on a phone is just lost width. */}
      <aside
        className={`fixed lg:sticky z-50 lg:z-auto left-0 top-0 lg:top-3 h-screen lg:h-[calc(100vh-1.5rem)]
          shrink-0 flex flex-col overflow-hidden border border-border bg-surface rounded-none lg:rounded-2xl
          px-3 pt-16 pb-6
          ${hydrated ? "transition-[width,transform,opacity] duration-300" : ""}
          ${open ? "w-60 translate-x-0 opacity-100" : "w-60 lg:w-[68px] -translate-x-full lg:translate-x-0 opacity-0 lg:opacity-100"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
      >
        <div className="flex items-center gap-2.5 mb-6 px-1.5">
          <div className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_-4px_rgba(10,132,255,0.8)]">
            <span className="font-mono text-[11px] font-semibold text-white">FR</span>
          </div>
          <span
            className={`font-semibold text-[15px] tracking-tight text-slate-100 whitespace-nowrap transition-opacity duration-200 ${
              open ? "opacity-100" : "lg:opacity-0"
            }`}
          >
            FAIR Risk Radar
          </span>
        </div>

        <nav className="flex flex-col gap-1 text-[13px]">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                onClick={closeAfterNav}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg whitespace-nowrap ${
                  active ? "text-slate-100 font-medium" : "text-slate-400 hover:text-slate-100"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-lg bg-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.20)]"
                  />
                )}
                <span className="relative shrink-0">
                  <Icon />
                </span>
                <span
                  className={`relative transition-opacity duration-200 ${open ? "opacity-100" : "lg:opacity-0"}`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div
          className={`mt-auto px-2 text-[11px] text-slate-600 leading-relaxed transition-opacity duration-200 ${
            open ? "opacity-100" : "lg:opacity-0"
          }`}
        >
          Quantitative FAIR model · compliance-as-code · audit-trailed
        </div>
      </aside>

      {/* key on pathname so the entrance choreography replays on navigation.
          pl-16 clears the floating burger on small screens; on desktop the
          sidebar itself holds that space. */}
      <main key={pathname} className="flex-1 min-w-0 pl-[60px] pr-4 sm:pr-6 lg:px-8 py-8 lg:py-10 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
