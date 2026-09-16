import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const scenarios = await prisma.scenario.findMany({
    orderBy: { label: "asc" },
    include: {
      coverage: { include: { control: true } },
      assessments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const payload = scenarios.map((s) => ({
    key: s.key,
    label: s.label,
    threat: s.threat,
    sourceCitation: s.sourceCitation,
    toleranceUsd: s.toleranceUsd,
    tef: s.tef,
    vulnBaseline: s.vulnBaseline,
    secProb: s.secProb,
    lossPrimary: s.lossPrimary,
    lossSecondary: s.lossSecondary,
    controls: s.coverage.map((c) => ({
      key: c.control.key,
      name: c.control.name,
      weight: c.control.weight,
      description: c.control.description,
      mappings: c.control.frameworkMappings,
      coveragePct: c.coveragePct,
      source: c.source,
    })),
    latestAssessment: s.assessments[0] ?? null,
  }));

  return NextResponse.json(payload);
}
