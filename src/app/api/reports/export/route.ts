// GET /api/reports/export?format=csv|pdf — current control posture + latest
// risk assessment, as an audit-evidence artifact.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCsvExport, buildPdfExport, type ExportRow } from "@/lib/report";

// Read hits the live DB on every request. Without this, Next.js 14 treats a
// no-arg GET route handler as static and bakes a build-time response into the
// deployment — so manual coverage overrides never show up in production.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ error: 'format must be "csv" or "pdf"' }, { status: 400 });
  }

  try {
    const controls = await prisma.control.findMany({
      include: { coverage: { orderBy: { recordedAt: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    });

    const rows: ExportRow[] = controls.map((c) => ({
      controlId: c.id,
      controlName: c.name,
      category: c.category,
      nistCsf: c.nistCsf,
      iso27001: c.iso27001,
      soc2: c.soc2,
      pciDss: c.pciDss,
      euAiAct: c.euAiAct,
      owaspLlm: c.owaspLlm,
      coveragePct: c.coverage[0]?.coveragePct ?? 0,
      coverageSource: c.coverage[0]?.source ?? "DEMO",
    }));

    const latest = await prisma.riskAssessment.findFirst({
      orderBy: { createdAt: "desc" },
      include: { scenario: true },
    });
    const assessment = latest
      ? {
          scenarioName: latest.scenario.name,
          meanAle: latest.meanAle,
          p10Ale: latest.p10Ale,
          p50Ale: latest.p50Ale,
          p90Ale: latest.p90Ale,
          riskTolerance: latest.riskTolerance,
          pExceedTolerance: latest.pExceedTolerance,
          generatedAt: latest.createdAt,
        }
      : null;

    if (format === "csv") {
      const csv = buildCsvExport(rows, assessment);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="fair-risk-radar-export.csv"',
        },
      });
    }

    const pdfBytes = await buildPdfExport(rows, assessment);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="fair-risk-radar-export.pdf"',
      },
    });
  } catch (err) {
    console.error("GET /api/reports/export failed:", err);
    return NextResponse.json({ error: "Failed to generate export" }, { status: 500 });
  }
}
