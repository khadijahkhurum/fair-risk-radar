// GET  /api/risk — assessment history (for the trend chart) + the latest run.
// POST /api/risk — run a new FAIR Monte Carlo simulation and persist it.
//                  Body: { scenarioId: string, threatIds?: string[], riskTolerance?: number }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scenarios } from "@/lib/scenarios";
import { threats } from "@/lib/threats";
import { runFairSimulation } from "@/lib/fair";
import { parseBody, RunAssessment } from "@/lib/api-schemas";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { PARAMETER_SET_HASH, MODEL_STAMP, isReproducible } from "@/lib/parameter-set";
import { assessmentLimiter } from "@/lib/rate-limit";

// Read hits the live DB on every request. Without this, Next.js 14 treats a
// no-arg GET route handler as static and bakes a build-time response into the
// deployment — so manual coverage overrides never show up in production.
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const history = await prisma.riskAssessment.findMany({
      where: { orgId: auth.user.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        scenario: true,
        approvedBy: { select: { email: true } },
        runBy: { select: { email: true } },
      },
    });
    // G4: the client needs to know whether each row is still re-derivable
    // against today's parameters. Computing it here keeps node:crypto server-
    // side and means the UI cannot disagree with the engine about it.
    return NextResponse.json({
      history: history.map((h) => ({ ...h, reproducible: isReproducible(h.parameterSetHash) })),
      stamp: MODEL_STAMP,
    });
  } catch (err) {
    console.error("GET /api/risk failed:", err);
    return NextResponse.json({ error: "Failed to load risk assessment history" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Persisting an assessment writes to the audit trail and the trend chart,
  // so it is an analyst action, not a viewer one (audit S6).
  const auth = await requireUser("ANALYST");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  // S7: this one writes a row and an audit event as well as burning 8,000
  // trials, so the ceiling is lower than the what-if panel's.
  const limit = assessmentLimiter.check(`assessment:${auth.user.id}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many assessments in a short period. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const parsed = await parseBody(req, RunAssessment);
  if (!parsed.ok) return parsed.response;
  const { threatIds = [], riskTolerance = null } = parsed.data;
  const scenario = scenarios.find((s) => s.id === parsed.data.scenarioId)!;
  const selectedThreats = threatIds.map((id) => threats.find((t) => t.id === id)!);

  try {
    const latestCoverage = await prisma.controlCoverage.findMany({
      where: { orgId },
      distinct: ["controlId"],
      orderBy: { recordedAt: "desc" },
    });
    const avgControlCoveragePct =
      latestCoverage.length > 0
        ? latestCoverage.reduce((sum, c) => sum + c.coveragePct, 0) / latestCoverage.length
        : 0;

    // The engine mints a seed per run and returns it; persisting it is what
    // makes the row re-derivable (audit M2).
    const result = runFairSimulation(scenario, selectedThreats, avgControlCoveragePct, riskTolerance);

    const saved = await prisma.riskAssessment.create({
      data: {
        orgId,
        scenarioId: scenario.id,
        threatIds: selectedThreats.map((t) => t.id),
        trials: result.trials,
        meanAle: result.meanAle,
        p10Ale: result.p10Ale,
        p50Ale: result.p50Ale,
        p90Ale: result.p90Ale,
        riskTolerance,
        pExceedTolerance: result.pExceedTolerance,
        avgControlCoveragePct,
        seed: result.seed,
        engineVersion: result.engineVersion,
        parameterSetVersion: result.parameterSetVersion,
        // G4: the content hash of the parameters these figures came from, and
        // who produced them. runById is what the approval check compares
        // against to enforce segregation of duties.
        parameterSetHash: PARAMETER_SET_HASH,
        runById: auth.user.id,
        seMeanAle: result.seMeanAle,
        sePExceedTolerance: result.sePExceedTolerance,
        toleranceForGreen: result.toleranceForGreen,
      },
    });

    await recordAuditEvent({
      orgId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      kind: "SIMULATION",
      detail: {
        assessmentId: saved.id,
        scenarioId: scenario.id,
        threatIds: selectedThreats.map((t) => t.id),
        trials: result.trials,
        avgControlCoveragePct,
        meanAle: result.meanAle,
        p90Ale: result.p90Ale,
        riskTolerance,
        pExceedTolerance: result.pExceedTolerance,
        seed: result.seed,
        engineVersion: result.engineVersion,
        parameterSetHash: PARAMETER_SET_HASH,
      },
    });

    return NextResponse.json({ assessment: saved, result });
  } catch (err) {
    console.error("POST /api/risk failed:", err);
    return NextResponse.json({ error: "Failed to run and persist risk assessment" }, { status: 500 });
  }
}
