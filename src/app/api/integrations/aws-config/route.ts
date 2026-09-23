// POST /api/integrations/aws-config — sync control coverage from AWS Config
// for every control that has an awsConfigRule. Returns demoMode: true per
// result when AWS credentials aren't configured (see src/lib/aws-config.ts).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAwsConfigCoverage } from "@/lib/aws-config";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  // Writes coverage for every mapped control in one call, so it sits at the
  // same privilege as setting coverage by hand.
  const auth = await requireUser("CONTROL_OWNER");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  try {
    const controls = await prisma.control.findMany({
      where: { awsConfigRule: { not: null } },
    });
    if (controls.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = await syncAwsConfigCoverage(
      controls.map((c) => ({ controlId: c.id, awsConfigRule: c.awsConfigRule as string }))
    );

    for (const result of results) {
      await prisma.controlCoverage.create({
        data: {
          orgId,
          controlId: result.controlId,
          coveragePct: result.coveragePct,
          source: result.demoMode ? "DEMO" : "AWS_CONFIG",
        },
      });
    }

    await recordAuditEvent({
      orgId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      kind: "COVERAGE",
      detail: {
        source: results.some((r) => r.demoMode) ? "DEMO" : "AWS_CONFIG",
        synced: results.map((r) => ({ controlId: r.controlId, coveragePct: r.coveragePct })),
      },
    });

    return NextResponse.json({ results });
  } catch (err) {
    console.error("POST /api/integrations/aws-config failed:", err);
    return NextResponse.json({ error: "AWS Config sync failed" }, { status: 500 });
  }
}
