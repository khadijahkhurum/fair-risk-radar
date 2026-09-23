// GET  /api/risks — the risk register.
// POST /api/risks — create a new tracked risk.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, CreateRisk } from "@/lib/api-schemas";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { requiresJustification, ownerDisplayName } from "@/lib/risk-governance";

// Read hits the live DB on every request. Without this, Next.js 14 treats a
// no-arg GET route handler as static and bakes a build-time response into the
// deployment — so manual coverage overrides never show up in production.
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    // S4: this previously returned every organisation's register, including
    // named accountable individuals, to anyone at all.
    const risks = await prisma.risk.findMany({
      where: { orgId: auth.user.orgId },
      orderBy: { createdAt: "desc" },
      include: { latestAssessment: true, owner: true },
    });
    // G8: the erased placeholder never leaves the server. G7: the client gets
    // the model's suggestion alongside the stored score so it can show which
    // is which, and whether a newer assessment has moved it.
    return NextResponse.json({
      risks: risks.map(({ owner, ...risk }) => ({
        ...risk,
        ownerId: owner.id,
        ownerName: ownerDisplayName(owner),
        ownerErased: owner.erasedAt !== null,
      })),
    });
  } catch (err) {
    console.error("GET /api/risks failed:", err);
    return NextResponse.json({ error: "Failed to load risk register" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("ANALYST");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  const parsed = await parseBody(req, CreateRisk);
  if (!parsed.ok) return parsed.response;
  const {
    title,
    description = "",
    ownerName,
    scenarioId,
    threatIds = [],
    riskTolerance = null,
    inherentLikelihood,
    inherentImpact,
    residualLikelihood,
    residualImpact,
    latestAssessmentId = null,
    suggestedInherentLikelihood = null,
    suggestedInherentImpact = null,
    suggestedResidualLikelihood = null,
    suggestedResidualImpact = null,
    overrideJustification = null,
  } = parsed.data;

  // G7: a score that diverges from the model needs a recorded reason, or the
  // register is back to being an opinion beside a number. Checked here rather
  // than in the schema because it is a cross-field rule the validator cannot
  // express, and checked on the SERVER because a client-side prompt is a
  // usability feature, not a control.
  const suggestedInherent =
    suggestedInherentLikelihood !== null && suggestedInherentImpact !== null
      ? { likelihood: suggestedInherentLikelihood, impact: suggestedInherentImpact }
      : null;
  const suggestedResidual =
    suggestedResidualLikelihood !== null && suggestedResidualImpact !== null
      ? { likelihood: suggestedResidualLikelihood, impact: suggestedResidualImpact }
      : null;

  for (const [human, suggested, label] of [
    [{ likelihood: inherentLikelihood, impact: inherentImpact }, suggestedInherent, "inherent rating"],
    [{ likelihood: residualLikelihood, impact: residualImpact }, suggestedResidual, "residual rating"],
  ] as const) {
    const check = requiresJustification(human, suggested, overrideJustification, label);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason, code: "JUSTIFICATION_REQUIRED" }, { status: 422 });
    }
  }

  try {
    // G8: the name is stored once, in the owner directory, and referenced from
    // here. Upserted rather than created so re-entering the same owner does
    // not fragment one person across several tombstones.
    const owner = await prisma.riskOwner.upsert({
      where: { orgId_displayName: { orgId, displayName: ownerName } },
      update: {},
      create: { orgId, displayName: ownerName },
    });

    const risk = await prisma.risk.create({
      data: {
        orgId,
        title,
        description,
        ownerId: owner.id,
        scenarioId,
        threatIds,
        riskTolerance,
        inherentLikelihood,
        inherentImpact,
        residualLikelihood,
        residualImpact,
        latestAssessmentId,
        suggestedInherentLikelihood,
        suggestedInherentImpact,
        suggestedResidualLikelihood,
        suggestedResidualImpact,
        overrideJustification,
        suggestionsFromAssessmentId: latestAssessmentId,
      },
    });
    await recordAuditEvent({
      orgId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      kind: "RISK",
      detail: {
        action: "created",
        riskId: risk.id,
        title: risk.title,
        // G8: the ID, never the name. Embedding the name here is what made
        // erasure impossible without rewriting a hash-chained record.
        ownerId: risk.ownerId,
        scenarioId: risk.scenarioId,
        inherent: { likelihood: risk.inherentLikelihood, impact: risk.inherentImpact },
        residual: { likelihood: risk.residualLikelihood, impact: risk.residualImpact },
      },
    });

    return NextResponse.json({ risk });
  } catch (err) {
    console.error("POST /api/risks failed:", err);
    return NextResponse.json({ error: "Failed to create risk" }, { status: 500 });
  }
}
