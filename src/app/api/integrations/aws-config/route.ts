import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAwsControlCoverage, isAwsConfigured, DEMO_COVERAGE, type ControlKey } from "@/lib/aws-config";

/**
 * POST /api/integrations/aws-config  { scenario: "healthcare" }
 *
 * If AWS credentials are configured, pulls real per-control compliance
 * percentages from AWS Config and writes them into ControlCoverage with
 * source "aws-config". If not, writes DEMO_COVERAGE with source "demo" so
 * the UI can still show what a synced state looks like — clearly labeled,
 * never presented as live data it isn't.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const scenarioKey = body.scenario as string | undefined;
  if (!scenarioKey) return NextResponse.json({ error: "scenario is required" }, { status: 400 });

  const scenario = await prisma.scenario.findUnique({
    where: { key: scenarioKey },
    include: { coverage: { include: { control: true } } },
  });
  if (!scenario) return NextResponse.json({ error: `unknown scenario "${scenarioKey}"` }, { status: 404 });

  const configured = isAwsConfigured();
  const live = configured ? await fetchAwsControlCoverage() : null;

  const results: { control: string; coveragePct: number; source: string }[] = [];

  for (const cc of scenario.coverage) {
    const key = cc.control.key as ControlKey;
    const livePct = live?.[key] ?? null;
    const coveragePct = livePct ?? DEMO_COVERAGE[key];
    const source = livePct !== null ? "aws-config" : "demo";

    await prisma.controlCoverage.update({
      where: { scenarioId_controlId: { scenarioId: scenario.id, controlId: cc.controlId } },
      data: { coveragePct, source },
    });

    results.push({ control: key, coveragePct, source });
  }

  return NextResponse.json({
    configured,
    demoMode: !configured,
    results,
    note: configured
      ? "Pulled from AWS Config via GetComplianceDetailsByConfigRule."
      : "AWS credentials not set — returned representative demo data. See .env.example.",
  });
}
