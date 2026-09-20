// POST /api/risks/suggest-ratings — runs the FAIR engine twice (once at 0%
// control coverage for the "inherent" position, once at current average
// coverage for "residual") and translates each into a 1-5 likelihood/impact
// suggestion. Nothing is persisted here — it's a preview for the risk
// creation form, always overridable by hand.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scenarios, expectedLossPerEvent } from "@/lib/scenarios";
import { threats } from "@/lib/threats";
import { runFairSimulation } from "@/lib/fair";
import { ratingFromAle, ratingFromProbability } from "@/lib/risk-rating";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { scenarioId, threatIds, riskTolerance } = (body ?? {}) as {
    scenarioId?: string;
    threatIds?: string[];
    riskTolerance?: number | null;
  };

  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return NextResponse.json({ error: "A valid scenarioId is required" }, { status: 400 });

  const selectedThreats = [];
  for (const id of Array.isArray(threatIds) ? threatIds : []) {
    const found = threats.find((t) => t.id === id);
    if (!found) return NextResponse.json({ error: `Unknown threatId "${id}"` }, { status: 400 });
    selectedThreats.push(found);
  }

  try {
    const latestCoverage = await prisma.controlCoverage.findMany({
      distinct: ["controlId"],
      orderBy: { recordedAt: "desc" },
    });
    const avgControlCoveragePct =
      latestCoverage.length > 0
        ? latestCoverage.reduce((sum, c) => sum + c.coveragePct, 0) / latestCoverage.length
        : 0;

    const tolerance = typeof riskTolerance === "number" ? riskTolerance : expectedLossPerEvent(scenario);

    const inherent = runFairSimulation(scenario, selectedThreats, 0, tolerance, 4000);
    const residual = runFairSimulation(scenario, selectedThreats, avgControlCoveragePct, tolerance, 4000);

    return NextResponse.json({
      inherent: {
        meanAle: inherent.meanAle,
        pExceedTolerance: inherent.pExceedTolerance,
        likelihood: ratingFromProbability(inherent.pExceedTolerance ?? 0),
        impact: ratingFromAle(inherent.meanAle),
      },
      residual: {
        meanAle: residual.meanAle,
        pExceedTolerance: residual.pExceedTolerance,
        likelihood: ratingFromProbability(residual.pExceedTolerance ?? 0),
        impact: ratingFromAle(residual.meanAle),
      },
      avgControlCoveragePct,
    });
  } catch (err) {
    console.error("POST /api/risks/suggest-ratings failed:", err);
    return NextResponse.json({ error: "Failed to compute rating suggestions" }, { status: 500 });
  }
}
