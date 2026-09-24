"use client";

// Brand splash shown once before the sign-in form.
//
// Deliberately NOT a separate route. A /loading page that redirects to /login
// is a second navigation, a redirect the back button lands on, and a blank
// frame between the two — all to show something this overlays for one second.
//
// Shown once per browser session: sessionStorage, so a reload during a demo
// doesn't replay it, and a new visitor still gets it. A failed storage read
// (private mode) falls through to showing it, which is the harmless direction.
import { useEffect, useState } from "react";

const KEY = "frr-splash-seen";
const HOLD_MS = 1100;

export function Splash() {
  const [state, setState] = useState<"checking" | "showing" | "leaving" | "gone">("checking");

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(KEY) === "1";
    } catch {
      // private mode / storage blocked — show it
    }
    // Anyone who asked for less motion gets none of this.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || still) {
      setState("gone");
      return;
    }
    setState("showing");
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {}

    const leave = setTimeout(() => setState("leaving"), HOLD_MS);
    const done = setTimeout(() => setState("gone"), HOLD_MS + 500);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, []);

  if (state === "gone" || state === "checking") return null;

  return (
    <div
      aria-hidden
      onClick={() => setState("gone")}
      className={`fixed inset-0 z-[100] grid place-items-center bg-canvas cursor-pointer transition-opacity duration-500 ${
        state === "leaving" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative w-16 h-16">
          {/* Three rings settling outward — a loss exceedance curve is a tail,
              and this is the cheapest honest nod to it that is not a spinner. */}
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border border-accent/40 animate-frr-ring"
              style={{ animationDelay: `${i * 260}ms` }}
            />
          ))}
          <span className="absolute inset-0 grid place-items-center">
            <span className="w-8 h-8 rounded-xl bg-accent grid place-items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_20px_-6px_rgba(10,132,255,0.9)]">
              <span className="font-mono text-[11px] font-semibold text-white">FR</span>
            </span>
          </span>
        </div>
        <div className="text-center">
          <div className="text-[15px] font-semibold tracking-tight text-slate-100">FAIR Risk Radar</div>
          <div className="text-[11px] text-slate-500 mt-1">Quantitative cyber risk · compliance as code</div>
        </div>
      </div>
    </div>
  );
}
