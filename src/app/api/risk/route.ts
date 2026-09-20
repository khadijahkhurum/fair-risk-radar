// GET  /api/risk — assessment history (for the trend chart) + the latest run.
// POST /api/risk — run a new FAIR Monte Carlo simulation and persist it.
//                  Body: { scenarioId: string, threatIds?: string[], riskTolerance?: number }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scenarios } from "@/lib/scenarios";
import { threats } from "@/lib/threats";
import { runFairSimulation } from "@/lib/fair";

// Read hits the live DB on every request. Without this, Next.js 14 treats a
// no-arg GET route handler as static and bakes a build-time response into the
// deployment — so manual coverage overrides never show up in production.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await prisma.riskAssessment.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { scenario: true },
    });
    return NextResponse.json({ history });
  } catch (err) {
    console.error("GET /api/risk failed:", err);
    return NextResponse.json({ error: "Failed to load risk assessment history" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { scenarioId, threatIds, riskTolerance } = (body ?? {}) as {
    scenarioId?: string;
    threatIds?: string[] | null;
    riskTolerance?: number | null;
  };

  if (!scenarioId || typeof scenarioId !== "string") {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: `Unknown scenarioId "${scenarioId}"` }, { status: 400 });
  }

  const requestedThreatIds = Array.isArray(threatIds) ? threatIds : [];
  const selectedThreats = [];
  for (const id of requestedThreatIds) {
    const found = threats.find((t) => t.id === id);
    if (!found) {
      return NextResponse.json({ error: `Unknown threatId "${id}"` }, { status: 400 });
    }
    selectedThreats.push(found);
  }

  if (
    riskTolerance !== undefined &&
    riskTolerance !== null &&
    (typeof riskTolerance !== "number" || riskTolerance < 0)
  ) {
    return NextResponse.json({ error: "riskTolerance must be a non-negative number" }, { status: 400 });
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

    const result = runFairSimulation(scenario, selectedThreats, avgControlCoveragePct, riskTolerance ?? null);

    const saved = await prisma.riskAssessment.create({
      data: {
        scenarioId: scenario.id,
        threatIds: selectedThreats.map((t) => t.id),
        trials: result.trials,
        meanAle: result.meanAle,
        p10Ale: result.p10Ale,
        p50Ale: result.p50Ale,
        p90Ale: result.p90Ale,
        riskTolerance: riskTolerance ?? null,
        pExceedTolerance: result.pExceedTolerance,
        avgControlCoveragePct,
      },
    });

    return NextResponse.json({ assessment: saved, result });
  } catch (err) {
    console.error("POST /api/risk failed:", err);
    return NextResponse.json({ error: "Failed to run and persist risk assessment" }, { status: 500 });
  }
}
