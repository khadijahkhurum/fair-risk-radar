// PATCH /api/risks/[id] — update a risk's status, owner, ratings, or linked assessment.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, UpdateRisk } from "@/lib/api-schemas";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { requiresJustification } from "@/lib/risk-governance";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser("ANALYST");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  const parsed = await parseBody(req, UpdateRisk);
  if (!parsed.ok) return parsed.response;
  const {
    status,
    ownerName,
    inherentLikelihood,
    inherentImpact,
    residualLikelihood,
    residualImpact,
    latestAssessmentId,
    overrideJustification,
  } = parsed.data;

  try {
    // Read first: the G7 justification rule compares the INCOMING rating
    // against the suggestion already stored on the row, so a partial update
    // that touches one axis is still checked against the whole pair.
    const existing = await prisma.risk.findFirst({ where: { id: params.id, orgId } });
    if (!existing) {
      return NextResponse.json({ error: "Risk not found" }, { status: 404 });
    }

    const nextInherent = {
      likelihood: inherentLikelihood ?? existing.inherentLikelihood,
      impact: inherentImpact ?? existing.inherentImpact,
    };
    const nextResidual = {
      likelihood: residualLikelihood ?? existing.residualLikelihood,
      impact: residualImpact ?? existing.residualImpact,
    };
    const suggestedInherent =
      existing.suggestedInherentLikelihood !== null && existing.suggestedInherentImpact !== null
        ? { likelihood: existing.suggestedInherentLikelihood, impact: existing.suggestedInherentImpact }
        : null;
    const suggestedResidual =
      existing.suggestedResidualLikelihood !== null && existing.suggestedResidualImpact !== null
        ? { likelihood: existing.suggestedResidualLikelihood, impact: existing.suggestedResidualImpact }
        : null;

    // An existing justification carries forward unless this request replaces
    // it — otherwise editing a risk's status would demand re-justifying a
    // divergence that was already explained.
    const justification = overrideJustification ?? existing.overrideJustification;

    for (const [human, suggested, label] of [
      [nextInherent, suggestedInherent, "inherent rating"],
      [nextResidual, suggestedResidual, "residual rating"],
    ] as const) {
      const check = requiresJustification(human, suggested, justification, label);
      if (!check.ok) {
        return NextResponse.json({ error: check.reason, code: "JUSTIFICATION_REQUIRED" }, { status: 422 });
      }
    }

    // G8: reassigning an owner resolves the name to a directory row; the risk
    // stores only the ID, so the name exists in exactly one place.
    let newOwnerId: string | null = null;
    if (ownerName !== undefined) {
      const owner = await prisma.riskOwner.upsert({
        where: { orgId_displayName: { orgId, displayName: ownerName } },
        update: {},
        create: { orgId, displayName: ownerName },
      });
      newOwnerId = owner.id;
    }

    // One object, used both for the emptiness check and the write, so the two
    // cannot disagree about whether there is anything to do.
    const data = {
      ...(status !== undefined ? { status } : {}),
      ...(inherentLikelihood !== undefined ? { inherentLikelihood } : {}),
      ...(inherentImpact !== undefined ? { inherentImpact } : {}),
      ...(residualLikelihood !== undefined ? { residualLikelihood } : {}),
      ...(residualImpact !== undefined ? { residualImpact } : {}),
      ...(overrideJustification !== undefined ? { overrideJustification } : {}),
      ...(latestAssessmentId !== undefined ? { latestAssessmentId } : {}),
      ...(newOwnerId !== null ? { ownerId: newOwnerId } : {}),
    };

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // updateMany rather than update: the org predicate is part of the WHERE,
    // so another tenant's risk is not found rather than being updated.
    const updated = await prisma.risk.updateMany({ where: { id: params.id, orgId }, data });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Risk not found" }, { status: 404 });
    }
    const risk = await prisma.risk.findFirst({ where: { id: params.id, orgId } });

    // G8: `changed: parsed.data` used to put ownerName straight into a
    // hash-chained record, which is exactly what made erasure impossible.
    // The name is swapped for the ID it now resolves through. Built by
    // inclusion rather than by omitting a key, so a field added to the schema
    // later cannot silently leak into the trail.
    const changed = {
      ...(status !== undefined ? { status } : {}),
      ...(inherentLikelihood !== undefined ? { inherentLikelihood } : {}),
      ...(inherentImpact !== undefined ? { inherentImpact } : {}),
      ...(residualLikelihood !== undefined ? { residualLikelihood } : {}),
      ...(residualImpact !== undefined ? { residualImpact } : {}),
      ...(overrideJustification !== undefined ? { overrideJustification } : {}),
      ...(latestAssessmentId !== undefined ? { latestAssessmentId } : {}),
    };
    await recordAuditEvent({
      orgId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      kind: "RISK",
      detail: {
        action: "updated",
        riskId: params.id,
        changed,
        ...(newOwnerId !== null ? { ownerId: newOwnerId } : {}),
      },
    });

    return NextResponse.json({ risk });
  } catch (err) {
    console.error("PATCH /api/risks/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update risk" }, { status: 500 });
  }
}
