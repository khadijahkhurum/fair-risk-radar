import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCsv, buildPdf } from "@/lib/report";

/** GET /api/reports/export?scenario=healthcare&format=csv|pdf */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("scenario");
  const format = (req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  if (!key) return NextResponse.json({ error: "scenario query param required" }, { status: 400 });
  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ error: 'format must be "csv" or "pdf"' }, { status: 400 });
  }

  const scenario = await prisma.scenario.findUnique({
    where: { key },
    include: {
      coverage: { include: { control: true } },
      assessments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!scenario) return NextResponse.json({ error: `unknown scenario "${key}"` }, { status: 404 });

  const assessment = scenario.assessments[0];
  if (!assessment) {
    return NextResponse.json(
      { error: "No assessment on record yet — run a simulation first (POST /api/risk)." },
      { status: 409 }
    );
  }

  const input = {
    scenarioLabel: scenario.label,
    threat: scenario.threat,
    sourceCitation: scenario.sourceCitation,
    toleranceUsd: scenario.toleranceUsd,
    controlCoverage: scenario.coverage.map((c) => ({
      name: c.control.name,
      coveragePct: c.coveragePct,
      source: c.source,
      mappings: c.control.frameworkMappings as Record<string, string>,
    })),
    assessment: {
      trials: assessment.trials,
      expectedAnnualLoss: assessment.expectedAnnualLoss,
      p50: assessment.p50,
      p95: assessment.p95,
      p99: assessment.p99,
      lossEventFrequency: assessment.lossEventFrequency,
      createdAt: assessment.createdAt.toISOString(),
    },
  };

  const filenameBase = `fair-risk-radar-${key}-${assessment.createdAt.toISOString().slice(0, 10)}`;

  if (format === "csv") {
    const csv = buildCsv(input);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  }

  const pdfBytes = await buildPdf(input);
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
    },
  });
}
