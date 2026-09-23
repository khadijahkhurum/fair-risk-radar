// PATCH /api/controls — manual control-coverage override.
// Body: { controlId: string, coveragePct: number }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, SetCoverage } from "@/lib/api-schemas";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";

export async function PATCH(req: NextRequest) {
  // S5: coverage drives adjustedVulnerability in every simulation, the ROI
  // optimum and the transfer verdict. It was anonymously writable. It is now
  // the highest-privilege routine action in the product.
  const auth = await requireUser("CONTROL_OWNER");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  const parsed = await parseBody(req, SetCoverage);
  if (!parsed.ok) return parsed.response;
  const { controlId, coveragePct } = parsed.data;

  try {
    const control = await prisma.control.findUnique({ where: { id: controlId } });
    if (!control) {
      return NextResponse.json({ error: `Unknown controlId "${controlId}"` }, { status: 404 });
    }

    const previous = await prisma.controlCoverage.findFirst({
      where: { orgId, controlId },
      orderBy: { recordedAt: "desc" },
      select: { coveragePct: true },
    });

    const coverage = await prisma.controlCoverage.create({
      data: { orgId, controlId, coveragePct, source: "MANUAL" },
    });

    // "Who changed this control's coverage from 40% to 90%, when, and on what
    // authority" is the first question in any SOC 2 walkthrough (audit G1).
    await recordAuditEvent({
      orgId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      kind: "COVERAGE",
      detail: {
        controlId,
        controlName: control.name,
        from: previous?.coveragePct ?? null,
        to: coveragePct,
        source: "MANUAL",
      },
    });

    return NextResponse.json({ coverage });
  } catch (err) {
    console.error("PATCH /api/controls failed:", err);
    return NextResponse.json({ error: "Failed to update control coverage" }, { status: 500 });
  }
}
