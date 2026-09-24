// PATCH /api/controls — manual control-coverage override.
// Body: { controlId: string, coveragePct: number, frameworkId?: string | null }
//
// Two kinds of write, and the difference matters:
//
//   frameworkId absent/null  BASE coverage — how much of the estate this
//                            control is actually deployed across. This is the
//                            figure the FAIR engine reads, so writing it moves
//                            every risk number in the product.
//   frameworkId set          Coverage of this control AS THAT FRAMEWORK SCOPES
//                            IT. Compliance reporting only. It never reaches
//                            the simulation, and it leaves every other
//                            framework's figure untouched — which is what makes
//                            the per-framework sliders independent.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, SetCoverage } from "@/lib/api-schemas";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { frameworks } from "@/lib/frameworks";

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
  // Normalise undefined to null: the column is nullable and "no framework" has
  // to be one value, or the base row stops being findable by the same query.
  const frameworkId = parsed.data.frameworkId ?? null;
  const framework = frameworkId ? frameworks.find((f) => f.id === frameworkId) : null;

  try {
    const control = await prisma.control.findUnique({ where: { id: controlId } });
    if (!control) {
      return NextResponse.json({ error: `Unknown controlId "${controlId}"` }, { status: 404 });
    }

    // The previous value for THIS scope. Comparing a scoped write against the
    // base figure would put a meaningless "from" in the audit trail.
    const previous = await prisma.controlCoverage.findFirst({
      where: { orgId, controlId, frameworkId },
      orderBy: { recordedAt: "desc" },
      select: { coveragePct: true },
    });

    const coverage = await prisma.controlCoverage.create({
      data: { orgId, controlId, frameworkId, coveragePct, source: "MANUAL" },
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
        // Which figure moved. A reader of the trail must be able to tell a
        // change to the deployment from a change to one framework's view of it,
        // because only the first one moves the risk numbers.
        scope: framework ? `framework:${framework.id}` : "base",
        scopeLabel: framework ? framework.label : "Base (deployment)",
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
