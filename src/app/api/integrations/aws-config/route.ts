// POST /api/integrations/aws-config — sync control coverage from AWS Config
// for every control that has an awsConfigRule. Returns demoMode: true per
// result when AWS credentials aren't configured (see src/lib/aws-config.ts).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAwsConfigCoverage } from "@/lib/aws-config";

export async function POST() {
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
          controlId: result.controlId,
          coveragePct: result.coveragePct,
          source: result.demoMode ? "DEMO" : "AWS_CONFIG",
        },
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("POST /api/integrations/aws-config failed:", err);
    return NextResponse.json({ error: "AWS Config sync failed" }, { status: 500 });
  }
}
