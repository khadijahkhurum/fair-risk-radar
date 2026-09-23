// POST /api/risk/whatif — re-runs the FAIR engine with a hypothetical control
// coverage % and/or threat set, WITHOUT persisting anything. Powers the
// dashboard's "what would make this green?" experiment panel: drag a
// coverage slider or untick a threat and see pExceedTolerance update live,
// without touching the real audit trail or real control posture.
import { NextRequest, NextResponse } from "next/server";
import { scenarios } from "@/lib/scenarios";
import { threats } from "@/lib/threats";
import { runFairSimulation, WHATIF_TRIALS } from "@/lib/fair";
import { parseBody, WhatIf } from "@/lib/api-schemas";
import { requireUser } from "@/lib/auth";
import { whatIfLimiter } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Persists nothing, but it is compute-heavy and reveals the loss model, so
  // it still needs a session (audit S1, S7).
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // S7: keyed by user, not IP. The session is already established at this
  // point, so the identity is real rather than a spoofable header — and one
  // user behind a shared NAT cannot exhaust the budget of everyone else on it.
  const limit = whatIfLimiter.check(`whatif:${auth.user.id}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many simulations. Slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const parsed = await parseBody(req, WhatIf);
  if (!parsed.ok) return parsed.response;
  // The schema has already checked every field against the catalogue and the
  // permitted ranges, so these lookups cannot miss and no clamping is needed.
  const {
    threatIds = [],
    riskTolerance: tolerance = null,
    coveragePct: coverage = 0,
    seed,
    trials = WHATIF_TRIALS,
  } = parsed.data;
  const scenario = scenarios.find((s) => s.id === parsed.data.scenarioId)!;
  const selectedThreats = threatIds.map((id) => threats.find((t) => t.id === id)!);

  try {
    // M7: the ROSI panel differenced an 8,000-trial baseline against a
    // 4,000-trial what-if drawn from a different RNG stream, then narrated the
    // result. When the caller supplies the baseline's seed and trial count,
    // both sides are the same sampled years and the difference is real rather
    // than mostly noise.
    //
    // sortedLosses is withheld by default: this endpoint fires on every
    // slider drag and the dashboard only needs the summary figures. The Risk
    // Transfer page asks for it explicitly, because pricing a layer exactly
    // (M8) means reading the sample rather than integrating the curve.
    const { sortedLosses, ...summary } = runFairSimulation(
      scenario,
      selectedThreats,
      coverage,
      tolerance,
      trials,
      seed
    );
    const result = parsed.data.includeSample ? { ...summary, sortedLosses } : summary;

    // S7: the panel used to fire 1 + N requests per debounce tick — one for
    // the current set, one per threat for the "without it" weights. With five
    // threats that was six authenticated Monte Carlo invocations per 400ms of
    // slider drag. They are now one request.
    //
    // This is not merely cheaper. Every leave-one-out variant runs against the
    // SAME seed as the main result, so each "without it" figure differs from
    // the headline only by the threat removed and not by which sampled years
    // the RNG happened to draw — the common-random-numbers discipline from M7,
    // applied to the marginal weights as well as the ROSI delta.
    const without: Record<string, number | null> = {};
    if (parsed.data.leaveOneOut && threatIds.length > 1) {
      for (const dropped of threatIds) {
        const remaining = selectedThreats.filter((t) => t.id !== dropped);
        const variant = runFairSimulation(
          scenario,
          remaining,
          coverage,
          tolerance,
          trials,
          seed ?? summary.seed
        );
        without[dropped] = variant.pExceedTolerance;
      }
    }

    return NextResponse.json({ result, without });
  } catch (err) {
    console.error("POST /api/risk/whatif failed:", err);
    return NextResponse.json({ error: "Failed to compute what-if simulation" }, { status: 500 });
  }
}
