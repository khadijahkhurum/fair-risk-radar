// PATCH /api/controls — manual control-coverage override.
// Body: { controlId: string, coveragePct: number }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { controlId, coveragePct } = (body ?? {}) as { controlId?: string; coveragePct?: number };

  if (!controlId || typeof controlId !== "string") {
    return NextResponse.json({ error: "controlId is required" }, { status: 400 });
  }
  if (typeof coveragePct !== "number" || Number.isNaN(coveragePct) || coveragePct < 0 || coveragePct > 100) {
    return NextResponse.json({ error: "coveragePct must be a number between 0 and 100" }, { status: 400 });
  }

  try {
    const control = await prisma.control.findUnique({ where: { id: controlId } });
    if (!control) {
      return NextResponse.json({ error: `Unknown controlId "${controlId}"` }, { status: 404 });
    }

    const coverage = await prisma.controlCoverage.create({
      data: { controlId, coveragePct, source: "MANUAL" },
    });

    return NextResponse.json({ coverage });
  } catch (err) {
    console.error("PATCH /api/controls failed:", err);
    return NextResponse.json({ error: "Failed to update control coverage" }, { status: 500 });
  }
}
