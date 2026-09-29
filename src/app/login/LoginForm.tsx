"use client";

// Sign-in (audit S1). Also the page that explains the access model, because a
// GRC tool's roles are part of what it is demonstrating.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ROLES, ROLE_LABEL, ROLE_DESCRIPTION, type Role } from "@/lib/roles";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-accounts";



export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only same-origin relative paths, so ?next= cannot be used as an open redirect.
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function signIn(withEmail: string, withPassword: string, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: withEmail, password: withPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_-4px_rgba(10,132,255,0.8)]">
            <span className="font-mono text-xs font-semibold text-white">FR</span>
          </div>
          <span className="font-semibold text-lg tracking-tight text-slate-100">FAIR Risk Radar</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold text-slate-100">Sign in</h1>
          <p className="text-sm text-slate-400 mt-1 mb-5">
            Risk registers, control posture and audit records are organisation-scoped. An account is required to see
            any of them.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              signIn(email, password, "form");
            }}
            className="space-y-3"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-400">Email</span>
              <input
                className="select"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-400">Password</span>
              <input
                className="select"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-risk">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy !== null} className="btn-primary w-full">
              {busy === "form" ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 mt-4">
          <h2 className="text-sm font-semibold text-slate-100 mb-1">Demo accounts</h2>
          <p className="text-xs text-slate-500 mb-4">
            Four roles, one demo organisation. Every action is attributed to the account you pick and appears in the
            audit trail under that name.
          </p>
          <div className="space-y-2">
            {ROLES.map((role) => (
              <button
                key={role}
                type="button"
                disabled={busy !== null}
                onClick={() => signIn(DEMO_EMAIL[role], DEMO_PASSWORD, role)}
                className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
              >
                <span className="text-sm font-medium text-slate-100">
                  {busy === role ? "Signing in…" : ROLE_LABEL[role]}
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">{ROLE_DESCRIPTION[role]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
