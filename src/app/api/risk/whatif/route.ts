// POST /api/risk/whatif — re-runs the FAIR engine with a hypothetical control
// coverage % and/or threat set, WITHOUT persisting anything. Powers the
// dashboard's "what would make this green?" experiment panel: drag a
// coverage slider or untick a threat and see pExceedTolerance update live,
// without touching the real audit trail or real control posture.
import { NextRequest, NextResponse } from "next/server";
import { scenarios } from "@/lib/scenarios";
import { threats } from "@/lib/threats";
import { runFairSimulation } from "@/lib/fair";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { scenarioId, threatIds, riskTolerance, coveragePct } = (body ?? {}) as {
    scenarioId?: string;
    threatIds?: string[];
    riskTolerance?: number | null;
    coveragePct?: number;
  };

  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return NextResponse.json({ error: "A valid scenarioId is required" }, { status: 400 });

  const selectedThreats = [];
  for (const id of Array.isArray(threatIds) ? threatIds : []) {
    const found = threats.find((t) => t.id === id);
    if (!found) return NextResponse.json({ error: `Unknown threatId "${id}"` }, { status: 400 });
    selectedThreats.push(found);
  }

  const coverage = Math.min(Math.max(Number(coveragePct) || 0, 0), 100);
  const tolerance = typeof riskTolerance === "number" ? riskTolerance : null;

  try {
    // Fewer trials than a real run (4000 vs 8000) — this fires on every
    // slider drag, so speed matters more than the extra precision here.
    const result = runFairSimulation(scenario, selectedThreats, coverage, tolerance, 4000);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("POST /api/risk/whatif failed:", err);
    return NextResponse.json({ error: "Failed to compute what-if simulation" }, { status: 500 });
  }
}
