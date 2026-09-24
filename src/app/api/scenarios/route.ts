// GET /api/scenarios — everything the dashboard needs to populate its
// dropdowns and control table on first load: industry scenarios, threat
// types, framework list, and controls with their latest coverage.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scenarios } from "@/lib/scenarios";
import { threats } from "@/lib/threats";
import { frameworks } from "@/lib/frameworks";
import { requireUser } from "@/lib/auth";

// Read hits the live DB on every request. Without this, Next.js 14 treats a
// no-arg GET route handler as static and bakes a build-time response into the
// deployment — so manual coverage overrides never show up in production.
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  try {
    // The control CATALOGUE is global — it is a set of definitions. Coverage
    // is what this organisation claims about those definitions, so it is
    // scoped (audit S2).
    const controls = await prisma.control.findMany({
      include: {
        // BASE coverage only — frameworkId null. This is the deployment figure,
        // and the one the simulation reads.
        coverage: {
          where: { orgId, frameworkId: null },
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    // Framework-scoped figures, one query for the whole catalogue. `distinct`
    // over (controlId, frameworkId) with a descending sort gives the latest row
    // per pair, so the append-only history stays intact while the read stays
    // bounded at one row per control per framework.
    const scopedRows = await prisma.controlCoverage.findMany({
      where: { orgId, frameworkId: { not: null } },
      orderBy: { recordedAt: "desc" },
      distinct: ["controlId", "frameworkId"],
      select: { controlId: true, frameworkId: true, coveragePct: true },
    });
    const scopedByControl = new Map<string, Record<string, number>>();
    for (const row of scopedRows) {
      if (!row.frameworkId) continue;
      const forControl = scopedByControl.get(row.controlId) ?? {};
      forControl[row.frameworkId] = row.coveragePct;
      scopedByControl.set(row.controlId, forControl);
    }

    const controlsWithCoverage = controls.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      category: c.category,
      nistCsf: c.nistCsf,
      iso27001: c.iso27001,
      soc2: c.soc2,
      pciDss: c.pciDss,
      euAiAct: c.euAiAct,
      owaspLlm: c.owaspLlm,
      awsConfigRule: c.awsConfigRule,
      coveragePct: c.coverage[0]?.coveragePct ?? 0,
      coverageSource: c.coverage[0]?.source ?? "DEMO",
      frameworkCoveragePct: scopedByControl.get(c.id),
    }));

    return NextResponse.json({ scenarios, threats, frameworks, controls: controlsWithCoverage });
  } catch (err) {
    console.error("GET /api/scenarios failed:", err);
    return NextResponse.json({ error: "Failed to load scenarios and controls" }, { status: 500 });
  }
}
