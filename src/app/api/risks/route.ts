// GET  /api/risks — the risk register.
// POST /api/risks — create a new tracked risk.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scenarios } from "@/lib/scenarios";
import { threats } from "@/lib/threats";

function isRating(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
}

export async function GET() {
  try {
    const risks = await prisma.risk.findMany({
      orderBy: { createdAt: "desc" },
      include: { latestAssessment: true },
    });
    return NextResponse.json({ risks });
  } catch (err) {
    console.error("GET /api/risks failed:", err);
    return NextResponse.json({ error: "Failed to load risk register" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const {
    title,
    description,
    ownerName,
    scenarioId,
    threatIds,
    riskTolerance,
    inherentLikelihood,
    inherentImpact,
    residualLikelihood,
    residualImpact,
    latestAssessmentId,
  } = (body ?? {}) as Record<string, unknown>;

  if (!title || typeof title !== "string") return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!ownerName || typeof ownerName !== "string")
    return NextResponse.json({ error: "ownerName is required" }, { status: 400 });
  if (!scenarioId || typeof scenarioId !== "string" || !scenarios.find((s) => s.id === scenarioId)) {
    return NextResponse.json({ error: "A valid scenarioId is required" }, { status: 400 });
  }
  const threatIdList = Array.isArray(threatIds) ? threatIds : [];
  for (const id of threatIdList) {
    if (!threats.find((t) => t.id === id)) {
      return NextResponse.json({ error: `Unknown threatId "${id}"` }, { status: 400 });
    }
  }
  for (const [label, value] of [
    ["inherentLikelihood", inherentLikelihood],
    ["inherentImpact", inherentImpact],
    ["residualLikelihood", residualLikelihood],
    ["residualImpact", residualImpact],
  ] as const) {
    if (!isRating(value)) {
      return NextResponse.json({ error: `${label} must be an integer 1-5` }, { status: 400 });
    }
  }
  if (
    riskTolerance !== undefined &&
    riskTolerance !== null &&
    (typeof riskTolerance !== "number" || riskTolerance < 0)
  ) {
    return NextResponse.json({ error: "riskTolerance must be a non-negative number" }, { status: 400 });
  }

  try {
    const risk = await prisma.risk.create({
      data: {
        title,
        description: typeof description === "string" ? description : "",
        ownerName,
        scenarioId,
        threatIds: threatIdList,
        riskTolerance: (riskTolerance as number | null) ?? null,
        inherentLikelihood: inherentLikelihood as number,
        inherentImpact: inherentImpact as number,
        residualLikelihood: residualLikelihood as number,
        residualImpact: residualImpact as number,
        latestAssessmentId: typeof latestAssessmentId === "string" ? latestAssessmentId : null,
      },
    });
    return NextResponse.json({ risk });
  } catch (err) {
    console.error("POST /api/risks failed:", err);
    return NextResponse.json({ error: "Failed to create risk" }, { status: 500 });
  }
}
