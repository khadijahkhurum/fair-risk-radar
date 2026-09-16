import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/controls  { scenario: "healthcare", control: "mfa", coveragePct: 72 }
 * Manual override for one control's coverage. Marks the row's source as
 * "manual" — if it was previously synced from AWS Config, this intentionally
 * overwrites that until the next sync.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { scenario: scenarioKey, control: controlKey, coveragePct } = body as {
    scenario?: string;
    control?: string;
    coveragePct?: number;
  };

  if (!scenarioKey || !controlKey || typeof coveragePct !== "number") {
    return NextResponse.json(
      { error: "scenario, control, and numeric coveragePct are required" },
      { status: 400 }
    );
  }
  if (coveragePct < 0 || coveragePct > 100) {
    return NextResponse.json({ error: "coveragePct must be between 0 and 100" }, { status: 400 });
  }

  const [scenario, control] = await Promise.all([
    prisma.scenario.findUnique({ where: { key: scenarioKey } }),
    prisma.control.findUnique({ where: { key: controlKey } }),
  ]);
  if (!scenario) return NextResponse.json({ error: `unknown scenario "${scenarioKey}"` }, { status: 404 });
  if (!control) return NextResponse.json({ error: `unknown control "${controlKey}"` }, { status: 404 });

  const updated = await prisma.controlCoverage.upsert({
    where: { scenarioId_controlId: { scenarioId: scenario.id, controlId: control.id } },
    update: { coveragePct, source: "manual" },
    create: { scenarioId: scenario.id, controlId: control.id, coveragePct, source: "manual" },
  });

  return NextResponse.json(updated);
}
