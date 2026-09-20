// GET /api/audit — one merged, reverse-chronological trail of everything that
// has happened: simulations run, coverage recorded, evidence attached, risks
// registered. Nothing new is stored for this; the tables were already
// append-only, which is what makes an audit trail an audit trail rather than
// a log someone can quietly edit.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scenarios } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

const PER_KIND = 60;

export type AuditKind = "SIMULATION" | "COVERAGE" | "EVIDENCE" | "RISK";

export interface AuditEvent {
  id: string;
  kind: AuditKind;
  at: string;
  title: string;
  detail: string;
  tag?: string;
}

export async function GET() {
  try {
    const [runs, coverage, evidence, risks] = await Promise.all([
      prisma.riskAssessment.findMany({ orderBy: { createdAt: "desc" }, take: PER_KIND }),
      prisma.controlCoverage.findMany({
        orderBy: { recordedAt: "desc" },
        take: PER_KIND,
        include: { control: { select: { name: true } } },
      }),
      prisma.evidence.findMany({
        orderBy: { uploadedAt: "desc" },
        take: PER_KIND,
        include: { control: { select: { name: true } } },
      }),
      prisma.risk.findMany({ orderBy: { createdAt: "desc" }, take: PER_KIND }),
    ]);

    const usd = (v: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
    const scenarioName = (id: string) => scenarios.find((s) => s.id === id)?.name ?? id;

    const events: AuditEvent[] = [
      ...runs.map((r) => ({
        id: `run-${r.id}`,
        kind: "SIMULATION" as const,
        at: r.createdAt.toISOString(),
        title: `Simulation run — ${scenarioName(r.scenarioId)}`,
        detail:
          `${r.trials.toLocaleString()} trials at ${Math.round(r.avgControlCoveragePct)}% control coverage. ` +
          `Mean ALE ${usd(r.meanAle)}, P90 ${usd(r.p90Ale)}.` +
          (r.riskTolerance !== null && r.pExceedTolerance !== null
            ? ` Tolerance ${usd(r.riskTolerance)} — breached ${(r.pExceedTolerance * 100).toFixed(2)}% of years.`
            : " No tolerance set."),
        tag: r.threatIds.length > 0 ? `${r.threatIds.length} threat${r.threatIds.length === 1 ? "" : "s"}` : "baseline",
      })),
      ...coverage.map((c) => ({
        id: `cov-${c.id}`,
        kind: "COVERAGE" as const,
        at: c.recordedAt.toISOString(),
        title: `Coverage recorded — ${c.control.name}`,
        detail: `Set to ${Math.round(c.coveragePct)}%.`,
        tag: c.source,
      })),
      ...evidence.map((e) => ({
        id: `ev-${e.id}`,
        kind: "EVIDENCE" as const,
        at: e.uploadedAt.toISOString(),
        title: `Evidence attached — ${e.control.name}`,
        detail: `${e.filename} · ${e.summary}`,
        tag: e.contentType.toUpperCase(),
      })),
      ...risks.map((r) => ({
        id: `risk-${r.id}`,
        kind: "RISK" as const,
        at: r.createdAt.toISOString(),
        title: `Risk registered — ${r.title}`,
        detail: `Owner ${r.ownerName}. Inherent ${r.inherentLikelihood}×${r.inherentImpact}, residual ${r.residualLikelihood}×${r.residualImpact}.`,
        tag: r.status,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return NextResponse.json({ events, counts: {
      SIMULATION: runs.length,
      COVERAGE: coverage.length,
      EVIDENCE: evidence.length,
      RISK: risks.length,
    } });
  } catch (err) {
    console.error("GET /api/audit failed:", err);
    return NextResponse.json({ error: "Failed to load audit trail" }, { status: 500 });
  }
}
