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
        coverage: { where: { orgId }, orderBy: { recordedAt: "desc" }, take: 1 },
      },
      orderBy: { name: "asc" },
    });

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
    }));

    return NextResponse.json({ scenarios, threats, frameworks, controls: controlsWithCoverage });
  } catch (err) {
    console.error("GET /api/scenarios failed:", err);
    return NextResponse.json({ error: "Failed to load scenarios and controls" }, { status: 500 });
  }
}
