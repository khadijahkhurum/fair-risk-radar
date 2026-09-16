import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { simulate, sensitivity, type FairProfile } from "@/lib/fair";

const TRIALS = 8000;
const SENSITIVITY_TRIALS = 2000;

async function loadScenario(key: string) {
  return prisma.scenario.findUnique({
    where: { key },
    include: { coverage: { include: { control: true } } },
  });
}

function buildProfile(scenario: NonNullable<Awaited<ReturnType<typeof loadScenario>>>): FairProfile {
  return {
    tef: scenario.tef as any,
    vulnBaseline: scenario.vulnBaseline as any,
    secProb: scenario.secProb as any,
    lossPrimary: scenario.lossPrimary as any,
    lossSecondary: scenario.lossSecondary as any,
  };
}

function weightedCoverage(scenario: NonNullable<Awaited<ReturnType<typeof loadScenario>>>): number {
  let sum = 0;
  for (const c of scenario.coverage) {
    sum += (c.coveragePct / 100) * c.control.weight;
  }
  return sum;
}

/** GET /api/risk?scenario=healthcare — latest persisted assessment, or 404 if none run yet. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("scenario");
  if (!key) return NextResponse.json({ error: "scenario query param required" }, { status: 400 });

  const scenario = await prisma.scenario.findUnique({ where: { key } });
  if (!scenario) return NextResponse.json({ error: `unknown scenario "${key}"` }, { status: 404 });

  const latest = await prisma.riskAssessment.findFirst({
    where: { scenarioId: scenario.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ assessment: latest });
}

/**
 * POST /api/risk  { scenario: "healthcare", includeSensitivity?: boolean }
 * Runs the Monte Carlo simulation against the scenario's current control
 * coverage, persists it as a RiskAssessment row, and returns the full result
 * (including the raw loss array for client-side charting).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const key = body.scenario as string | undefined;
  if (!key) return NextResponse.json({ error: "scenario is required" }, { status: 400 });

  const scenario = await loadScenario(key);
  if (!scenario) return NextResponse.json({ error: `unknown scenario "${key}"` }, { status: 404 });

  const profile = buildProfile(scenario);
  const coverage = weightedCoverage(scenario);
  const result = simulate(profile, coverage, TRIALS);

  const controlSnapshot = Object.fromEntries(
    scenario.coverage.map((c) => [c.control.key, c.coveragePct])
  );

  const saved = await prisma.riskAssessment.create({
    data: {
      scenarioId: scenario.id,
      trials: result.trials,
      expectedAnnualLoss: result.mean,
      p50: result.p50,
      p95: result.p95,
      p99: result.p99,
      lossEventFrequency: result.lossEventFrequency,
      controlSnapshot,
    },
  });

  let sensitivityRows: ReturnType<typeof sensitivity> | null = null;
  if (body.includeSensitivity) {
    sensitivityRows = sensitivity(profile, coverage, SENSITIVITY_TRIALS);
  }

  return NextResponse.json({
    assessment: saved,
    losses: result.losses, // sorted, for the client to build the exceedance curve / histogram
    coverage,
    sensitivity: sensitivityRows,
  });
}
