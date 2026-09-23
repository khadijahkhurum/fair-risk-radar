// POST /api/risk/[id]/approve — sign off a persisted assessment (audit G4).
//
// This is the artefact the auditor asked for: the thing that distinguishes a
// scratch run from a figure somebody put their name to. The decision itself
// lives in src/lib/approval.ts so it is pure and tested; this route is the
// transaction around it.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { canApprove, APPROVER_ROLE } from "@/lib/approval";
import { isReproducible, MODEL_STAMP } from "@/lib/parameter-set";
import { parseBody, ApproveAssessment } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(APPROVER_ROLE);
  if (!auth.ok) return auth.response;
  const { orgId, id: approverId, email, role } = auth.user;

  const parsed = await parseBody(req, ApproveAssessment);
  if (!parsed.ok) return parsed.response;
  const note = parsed.data.note ?? null;

  try {
    // Org-scoped read (S2): an admin of one organisation cannot sign off
    // another organisation's figures, and cannot learn that they exist.
    const assessment = await prisma.riskAssessment.findFirst({
      where: { id: params.id, orgId },
      include: { scenario: { select: { name: true } } },
    });
    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    const check = canApprove(
      {
        status: assessment.status,
        runById: assessment.runById,
        parameterSetHash: assessment.parameterSetHash,
      },
      { id: approverId, role },
      isReproducible(assessment.parameterSetHash)
    );
    if (!check.ok) {
      // 409, not 403: the request is authorised, the assessment's state is
      // what refuses it. A 403 would send the caller looking for a
      // permissions problem that isn't there.
      return NextResponse.json({ error: check.reason, code: check.code }, { status: 409 });
    }

    // Guarded by status in the WHERE clause, so two concurrent approvals
    // cannot both land — the second updates zero rows and is refused.
    const updated = await prisma.riskAssessment.updateMany({
      where: { id: assessment.id, orgId, status: "DRAFT" },
      data: {
        status: "APPROVED",
        approvedById: approverId,
        approvedAt: new Date(),
        approvalNote: note,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: "This assessment was approved by someone else moments ago.", code: "ALREADY_APPROVED" },
        { status: 409 }
      );
    }

    // The approval has to bind the specific figures, not just the row id —
    // otherwise "approved" is an attribute of a database record rather than an
    // attestation to a number. These land in the hash-chained trail.
    await recordAuditEvent({
      orgId,
      actorId: approverId,
      actorEmail: email,
      actorRole: role,
      kind: "APPROVAL",
      detail: {
        assessmentId: assessment.id,
        scenarioName: assessment.scenario.name,
        runById: assessment.runById,
        meanAle: assessment.meanAle,
        p90Ale: assessment.p90Ale,
        riskTolerance: assessment.riskTolerance,
        pExceedTolerance: assessment.pExceedTolerance,
        trials: assessment.trials,
        seed: assessment.seed,
        engineVersion: assessment.engineVersion,
        parameterSetVersion: assessment.parameterSetVersion,
        parameterSetHash: assessment.parameterSetHash,
        note,
      },
    });

    return NextResponse.json({
      ok: true,
      assessmentId: assessment.id,
      approvedAt: new Date().toISOString(),
      stamp: MODEL_STAMP,
    });
  } catch (err) {
    console.error("POST /api/risk/[id]/approve failed:", err);
    return NextResponse.json({ error: "Failed to record approval" }, { status: 500 });
  }
}
